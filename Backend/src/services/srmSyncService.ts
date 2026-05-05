/**
 * SRM Sync Service
 *
 * Replaces AI-based attribute extraction for presentation data that already
 * exists in the SRM (Sample Request Management) system.
 *
 * Instead of scanning images with a VLM to read attributes off a whiteboard,
 * this service fetches structured data from the SRM API and inserts it
 * directly into extraction_results_flat — no AI cost, instant results.
 *
 * Fields from SRM API:
 *   presentation_no   → pptNumber
 *   vendor_code       → vendorCode
 *   division          → division
 *   sub_division      → subDivision
 *   major_category    → majorCategory
 *   design_number     → designNumber
 *   fabric            → macroMvgr (closest match)
 *   no_of_colors      → stored in impAtrbt2 as "Colors: N"
 *   price             → rate
 *   image_url         → imageUrl
 */

import { prismaClient as prisma } from '../utils/prisma';
import { getHsnCodeByMcCode, getMcCodeByMajorCategory } from '../utils/mcCodeMapper';
import { getSegmentByCategoryAndMrp } from '../utils/segmentRangeMapper';
import { buildArticleDescription } from '../utils/articleDescriptionBuilder';
import { mirror360FlatUpdate } from '../utils/mirror360Flat';
import { VLMService } from './vlm/vlmService';
import { mvgrMappingService } from './mvgrMappingService';

const SRM_API_BASE = 'https://pymdqnnwwxrgeolvgvgv.supabase.co/functions/v1/srm-presentation-images-api';
const SRM_API_KEY = process.env.SRM_API_KEY || 'v2@123';
const SRM_SUPABASE_KEY = process.env.SRM_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bWRxbm53d3hyZ2VvbHZndmd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMzU0NzYsImV4cCI6MjA2ODkxMTQ3Nn0.jUrb0jIg6qjj2Rlh9DxYesSnbstoD4uoDCswqOqAkUM';
const PAGE_SIZE = 100;

interface SrmRow {
  presentation_no: string;
  vendor_code: string;
  division: string;
  sub_division: string;
  major_category: string;
  presentation_received_date: string;
  design_number: string;
  fabric: string;
  no_of_colors: number;
  price: number;
  image_url?: string | null;
}

interface SrmApiResponse {
  page: number;
  page_size: number;
  total: number;
  rows: SrmRow[];
}

interface SyncResult {
  inserted: number;
  skipped: number;
  errors: number;
  total: number;
}

/**
 * Fetch one page from the SRM API.
 */
async function fetchPage(page: number): Promise<SrmApiResponse> {
  const url = `${SRM_API_BASE}?page=${page}&page_size=${PAGE_SIZE}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SRM_SUPABASE_KEY,
      'Authorization': `Bearer ${SRM_SUPABASE_KEY}`,
      'x-api-key': SRM_API_KEY,
    },
  });
  if (!res.ok) {
    throw new Error(`SRM API error: HTTP ${res.status}`);
  }
  return res.json() as Promise<SrmApiResponse>;
}

/**
 * Fetch all pages and return every row.
 */
async function fetchAllRows(): Promise<SrmRow[]> {
  const first = await fetchPage(1);
  const allRows: SrmRow[] = [...first.rows];
  const totalPages = Math.ceil(first.total / PAGE_SIZE);
  for (let p = 2; p <= totalPages; p++) {
    const page = await fetchPage(p);
    allRows.push(...page.rows);
  }
  return allRows;
}

/**
 * Find an existing SRM record for this presentation_no + design_number pair.
 * Returns the record id and current imageUrl so we can patch the image if needed.
 */
async function findExisting(presentationNo: string, designNumber: string): Promise<{ id: string; imageUrl: string | null } | null> {
  return prisma.extractionResultFlat.findFirst({
    where: {
      pptNumber: presentationNo,
      designNumber: designNumber,
      source: 'SRM',
    },
    select: { id: true, imageUrl: true },
  });
}

/**
 * Resolve a Category ID from the major_category code (same fallback chain as the watcher).
 */
async function resolveCategoryId(majorCategory: string, division: string): Promise<number> {
  // Try exact code match first
  const exact = await prisma.category.findFirst({
    where: { code: { equals: majorCategory, mode: 'insensitive' } },
    select: { id: true },
  });
  if (exact) return exact.id;

  // Fallback: first category in the division
  const divisionFallback = await prisma.category.findFirst({
    where: {
      subDepartment: {
        department: { name: { equals: division, mode: 'insensitive' } },
      },
    },
    select: { id: true },
  });
  if (divisionFallback) return divisionFallback.id;

  // Absolute last resort
  const any = await prisma.category.findFirst({ select: { id: true } });
  if (any) return any.id;

  throw new Error('No Category found in database — cannot create ExtractionJob');
}

/**
 * VLM enrichment for SRM records that have an image URL.
 * Runs after the flat row is already created, fills in all the garment
 * attributes that SRM doesn't provide (FAB, BODY, VA ACC, PRINTING groups).
 * Never overwrites the SRM-authoritative fields.
 */
const vlmService = new VLMService();

async function enrichSrmRowWithVlm(flatId: string, imageUrl: string, majorCategory: string | null): Promise<void> {
  try {
    // Build schema from all active master attributes
    const masterAttrs = await prisma.masterAttribute.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        allowedValues: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } }
      }
    });

    const schema = masterAttrs.map(attr => ({
      key: attr.key,
      label: attr.label || attr.key,
      type: attr.type.toLowerCase() as any,
      allowedValues: attr.allowedValues.map((av: any) => av.shortForm),
    }));

    const result = await vlmService.extractFashionAttributes({
      image: imageUrl,
      schema,
      categoryName: majorCategory || undefined,
      discoveryMode: false,
    });

    const attrs = result.attributes || {};
    const get = (...keys: string[]): string | null => {
      for (const key of keys) {
        const attr = attrs[key];
        if (!attr) continue;
        const v = attr.schemaValue ?? attr.rawValue;
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
      return null;
    };

    const updates: Record<string, any> = {};

    // FAB group
    const yarn1 = get('yarn_01');       if (yarn1)  updates.yarn1  = yarn1;
    const yarn2 = get('yarn_02');       if (yarn2)  updates.yarn2  = yarn2;
    const mainMvgr = get('main_mvgr'); if (mainMvgr) {
      updates.mainMvgr = mainMvgr;
      updates.mainMvgrFullForm = mvgrMappingService.getMainMvgrFullForm(mainMvgr);
    }
    const fabMain = get('fabric_main_mvgr'); if (fabMain) updates.fabricMainMvgr = fabMain;
    const weave   = get('weave');            if (weave)   updates.weave           = weave;
    const mFab2   = get('m_fab2');           if (mFab2)   {
      updates.mFab2 = mFab2;
      updates.mFab2FullForm = mvgrMappingService.getWeave2FullForm(mFab2);
    }
    const comp    = get('composition');      if (comp)    updates.composition     = comp;
    const finish  = get('finish');           if (finish)  updates.finish          = finish;
    const gsm     = get('gsm', 'gram_per_square_meter'); if (gsm) updates.gsm   = gsm;
    const shade   = get('shade');            if (shade)   updates.shade           = shade;
    const lycra   = get('lycra_non_lycra'); if (lycra)   updates.lycra           = lycra;
    const fCount  = get('f_count');          if (fCount)  updates.fCount          = fCount;
    const fConstr = get('f_construction');   if (fConstr) updates.fConstruction   = fConstr;
    const fOunce  = get('f_ounce');          if (fOunce)  updates.fOunce          = fOunce;
    const fWidth  = get('f_width');          if (fWidth)  updates.fWidth          = fWidth;

    // Weight — extract numeric only
    const weightAttr = attrs['weight'] ?? attrs['g_weight'] ?? attrs['G-Weight'];
    if (weightAttr) {
      const v = weightAttr.schemaValue ?? weightAttr.rawValue;
      if (v != null) {
        const match = String(v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
        if (match) updates.weight = match[1];
      }
    }

    // BODY group
    const neck       = get('neck');                          if (neck)       updates.neck           = neck;
    const neckDet    = get('neck_details', 'neck_detail');   if (neckDet)    updates.neckDetails    = neckDet;
    const collar     = get('collar');                        if (collar)     updates.collar         = collar;
    const collarSt   = get('collar_style');                  if (collarSt)   updates.collarStyle    = collarSt;
    const placket    = get('placket');                       if (placket)    updates.placket        = placket;
    const sleeve     = get('sleeve');                        if (sleeve)     updates.sleeve         = sleeve;
    const sleeveFold = get('sleeve_fold');                   if (sleeveFold) updates.sleeveFold     = sleeveFold;
    const botFold    = get('bottom_fold');                   if (botFold)    updates.bottomFold     = botFold;
    const frontOpen  = get('front_open_style');              if (frontOpen)  updates.frontOpenStyle = frontOpen;
    const noOfPocket = get('no_of_pocket');                  if (noOfPocket) updates.noOfPocket     = noOfPocket;
    const pocketType = get('pocket_type');                   if (pocketType) updates.pocketType     = pocketType;
    const extraPkt   = get('extra_pocket');                  if (extraPkt)   updates.extraPocket    = extraPkt;
    const fit        = get('fit');                           if (fit)        updates.fit            = fit;
    const pattern    = get('pattern', 'body_style');         if (pattern)    updates.pattern        = pattern;
    const length     = get('length');                        if (length)     updates.length         = length;
    const colour     = get('colour', 'color');               if (colour)     updates.colour         = colour;
    const fatBelt    = get('father_belt');                   if (fatBelt)    updates.fatherBelt     = fatBelt;
    const childBelt  = get('child_belt');                    if (childBelt)  updates.childBelt      = childBelt;
    const ageGroup   = get('age_group');                     if (ageGroup)   updates.ageGroup       = ageGroup;

    // VA ACC group
    const drawcord  = get('drawcord');                       if (drawcord)  updates.drawcord   = drawcord;
    const dcShape   = get('dc_shape');                       if (dcShape)   updates.dcShape    = dcShape;
    const button    = get('button');                         if (button)    updates.button     = button;
    const btnColour = get('btn_colour');                     if (btnColour) updates.btnColour  = btnColour;
    const zipper    = get('zipper');                         if (zipper)    updates.zipper     = zipper;
    const zipColour = get('zip_colour');                     if (zipColour) updates.zipColour  = zipColour;
    const patches   = get('patches');                        if (patches)   updates.patches    = patches;
    const patchType = get('patches_type', 'patch_type');     if (patchType) updates.patchesType = patchType;
    const htrfType  = get('htrf_type');                      if (htrfType)  updates.htrfType   = htrfType;
    const htrfStyle = get('htrf_style');                     if (htrfStyle) updates.htrfStyle  = htrfStyle;

    // PRINTING group
    const printType  = get('print_type');                    if (printType)  updates.printType  = printType;
    const printStyle = get('print_style');                   if (printStyle) updates.printStyle = printStyle;
    const printPlace = get('print_placement');               if (printPlace) updates.printPlacement = printPlace;
    const emb        = get('embroidery');                    if (emb)        updates.embroidery = emb;
    const embType    = get('embroidery_type');               if (embType)    updates.embroideryType = embType;
    const embPlace   = get('emb_placement');                 if (embPlace)   updates.embPlacement   = embPlace;
    const wash       = get('wash');                          if (wash)       updates.wash       = wash;

    // Misc
    const fashionGrid   = get('fashion_grid', 'fashiongrid');                   if (fashionGrid)   updates.fashionGrid        = fashionGrid;
    const articleType   = get('article_type', 'articletype');                   if (articleType)   updates.articleType        = articleType;
    const artFashType   = get('article_fashion_type', 'fashion_grade');         if (artFashType)   updates.articleFashionType = artFashType;

    // Mark as VLM-enriched
    updates.extractionStatus = 'COMPLETED';
    updates.aiModel = result.modelUsed ? String(result.modelUsed) : 'google-gemini';
    if (result.confidence != null) updates.avgConfidence = result.confidence;

    if (Object.keys(updates).length <= 3) {
      // Only metadata fields set — VLM returned nothing useful
      return;
    }

    await prisma.extractionResultFlat.update({ where: { id: flatId }, data: updates });

    // Rebuild article description with the newly populated fields
    const updatedRow = await prisma.extractionResultFlat.findUnique({ where: { id: flatId } });
    if (updatedRow) {
      const artDesc = buildArticleDescription(updatedRow as any);
      if (artDesc) {
        await prisma.extractionResultFlat.update({
          where: { id: flatId },
          data: { articleDescription: artDesc }
        });
        updates.articleDescription = artDesc;
      }
    }

    void mirror360FlatUpdate(flatId, updates);
    console.log(`[SRM VLM] Enriched ${flatId} — ${Object.keys(updates).length} fields from VLM`);
  } catch (err: any) {
    console.error(`[SRM VLM] Enrichment failed for ${flatId}:`, err.message);
    // Non-fatal — SRM record stays with basic data
  }
}

/**
 * Insert one SRM row into the database.
 */
async function insertRow(row: SrmRow): Promise<void> {
  const categoryId = await resolveCategoryId(row.major_category, row.division);

  // Create ExtractionJob (required by FK; no AI used — just a shell record)
  const srmImageUrl = row.image_url || null;

  const job = await prisma.extractionJob.create({
    data: {
      categoryId,
      imageUrl: srmImageUrl || '',
      status:   'COMPLETED',
      aiModel:  null,
      designNumber: row.design_number || null,
    },
  });

  // Compute derived fields
  const now = new Date();
  const month = now.getMonth() + 1;
  const yearShort = String(now.getFullYear()).slice(-2);
  let season = `W${yearShort}`;
  if      (month >= 1 && month <= 3) season = `SP${yearShort}`;
  else if (month >= 4 && month <= 6) season = `S${yearShort}`;
  else if (month >= 7 && month <= 9) season = `A${yearShort}`;

  const mcCode     = getMcCodeByMajorCategory(row.major_category) || null;
  const hsnTaxCode = mcCode ? (getHsnCodeByMcCode(mcCode) || null) : null;
  const rate       = row.price > 0 ? row.price : null;
  const segment    = getSegmentByCategoryAndMrp(row.major_category, rate ? rate as any : null) || null;

  // Store no_of_colors in impAtrbt2 if set
  const impAtrbt2 = row.no_of_colors ? `Colors: ${row.no_of_colors}` : null;

  // Create ExtractionResultFlat directly — no flattening from AI results needed
  const flat = await prisma.extractionResultFlat.create({
    data: {
      jobId:          job.id,
      source:         'SRM',
      extractionStatus: 'SRM_IMPORT',
      imageName:      null,
      imageUrl:       srmImageUrl,

      // SRM-provided fields
      pptNumber:      row.presentation_no || null,
      designNumber:   row.design_number   || null,
      vendorCode:     row.vendor_code     || null,
      division:       row.division        || null,
      subDivision:    row.sub_division    || null,
      majorCategory:  row.major_category  || null,
      macroMvgr:      row.fabric          || null,   // Best available fabric field
      rate:           rate as any,
      impAtrbt2:      impAtrbt2,

      // Derived fields
      year:           String(now.getFullYear()),
      season,
      mcCode:         mcCode || null,
      hsnTaxCode,
      segment,
      extractionDate: now,
    },
  });

  // Build article description from available fields
  try {
    const artDesc = buildArticleDescription(flat as any);
    if (artDesc) {
      await prisma.extractionResultFlat.update({
        where: { id: flat.id },
        data: { articleDescription: artDesc },
      });
      void mirror360FlatUpdate(flat.id, { articleDescription: artDesc });
    }
  } catch {
    // Non-critical
  }

  // Mirror to 360article schema
  void mirror360FlatUpdate(flat.id, {
    source: 'SRM', extractionStatus: 'SRM_IMPORT',
    pptNumber: flat.pptNumber, designNumber: flat.designNumber,
    vendorCode: flat.vendorCode, division: flat.division,
    subDivision: flat.subDivision, majorCategory: flat.majorCategory,
    macroMvgr: flat.macroMvgr, rate: flat.rate,
    year: flat.year, season: flat.season, mcCode: flat.mcCode,
    hsnTaxCode: flat.hsnTaxCode, segment: flat.segment,
  });

  // NOTE: Do NOT call duplicateForKidsDivision for SRM records.
  // SRM provides the exact major category from the vendor — we must trust it as-is.
  // Duplication would create spurious sibling records (e.g. YBW_... alongside JBW_...).
  // Variant creation is also skipped for the same reason.

  // Enrich with VLM extraction if an image is available
  if (srmImageUrl) {
    void enrichSrmRowWithVlm(flat.id, srmImageUrl, row.major_category || null);
  }
}

/**
 * Main sync function. Call this from the route handler or cron job.
 */
export async function syncFromSrm(): Promise<SyncResult> {
  console.log('[SRM Sync] Starting sync from SRM API...');
  const result: SyncResult = { inserted: 0, skipped: 0, errors: 0, total: 0 };

  let rows: SrmRow[];
  try {
    rows = await fetchAllRows();
  } catch (err: any) {
    console.error('[SRM Sync] Failed to fetch from SRM API:', err.message);
    throw err;
  }

  result.total = rows.length;
  console.log(`[SRM Sync] Fetched ${rows.length} records from SRM API`);

  for (const row of rows) {
    try {
      const existing = await findExisting(row.presentation_no, row.design_number);
      if (existing) {
        // Record exists — patch imageUrl if the API now provides one and we don't have it yet
        if (row.image_url && !existing.imageUrl) {
          await prisma.extractionResultFlat.update({
            where: { id: existing.id },
            data: { imageUrl: row.image_url },
          });
          void mirror360FlatUpdate(existing.id, { imageUrl: row.image_url });
          // Now that there's an image, enrich with VLM
          void enrichSrmRowWithVlm(existing.id, row.image_url, row.major_category || null);
          console.log(`[SRM Sync] Patched image for: ${row.presentation_no} / ${row.design_number}`);
          result.inserted++; // count as updated
        } else {
          result.skipped++;
        }
        continue;
      }
      await insertRow(row);
      result.inserted++;
      console.log(`[SRM Sync] Inserted: ${row.presentation_no} / ${row.design_number}`);
    } catch (err: any) {
      result.errors++;
      console.error(`[SRM Sync] Error for ${row.presentation_no}/${row.design_number}:`, err.message);
    }
  }

  console.log(`[SRM Sync] Done — inserted: ${result.inserted}, skipped: ${result.skipped}, errors: ${result.errors}`);
  return result;
}
