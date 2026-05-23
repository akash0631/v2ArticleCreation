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
import { storageService } from './storageService';

const SRM_API_BASE = 'https://pymdqnnwwxrgeolvgvgv.supabase.co/functions/v1/srm-presentation-images-api';
const SRM_API_KEY = process.env.SRM_API_KEY || 'v2@123';
const SRM_SUPABASE_KEY = process.env.SRM_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bWRxbm53d3hyZ2VvbHZndmd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMzU0NzYsImV4cCI6MjA2ODkxMTQ3Nn0.jUrb0jIg6qjj2Rlh9DxYesSnbstoD4uoDCswqOqAkUM';
const PAGE_SIZE = 100;

interface SrmRow {
  presentation_no: string;
  vendor_code: string;
  vendor_name?: string | null;
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

/** Normalise vendor code to last 6 digits (e.g. "0000200251" → "200251") */
function normaliseVendorCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length > 6 ? digits.slice(-6) : digits || null;
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

export interface EnrichResult {
  processed: number;
  enriched: number;
  failed: number;
}

// Module-level cache: last completed sync result + timestamp
export interface LastSyncResult extends SyncResult {
  completedAt: string; // ISO string
  ranAt: string;       // ISO string (when sync started)
}
let _lastSyncResult: LastSyncResult | null = null;
export function getLastSrmSyncResult(): LastSyncResult | null { return _lastSyncResult; }

// Minimum delay between consecutive VLM calls to avoid Gemini rate limits
const VLM_ENRICH_DELAY_MS = 2000;

/**
 * Fetches an image URL (Supabase private or public R2) and returns it as a
 * data-URI base64 string suitable for the VLM provider.
 *
 * Supabase private storage URLs require `apikey` + `Authorization` headers.
 * Public R2 URLs work with a plain fetch (no headers needed).
 *
 * Returns null if the fetch fails for any reason.
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    // SRM image URLs (api.v2retail.com/storage/v1/object/public/...) are publicly
    // accessible — no auth headers required.
    const res = await fetch(imageUrl);
    if (!res.ok) {
      console.warn(`[SRM Image] fetchImageAsBase64 failed ${res.status} for: ${imageUrl.slice(0, 120)}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mimeBase = contentType.split(';')[0].trim().toLowerCase();
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${mimeBase};base64,${buffer.toString('base64')}`;
  } catch (err: any) {
    console.warn(`[SRM Image] fetchImageAsBase64 error: ${err.message}`);
    return null;
  }
}

/**
 * Downloads an SRM image URL (which may be a private Supabase storage URL or a
 * short-lived signed URL) using the SRM Supabase auth headers, then re-uploads it
 * to our own R2 bucket so it is permanently accessible without authentication.
 *
 * Returns the permanent R2 public URL, or null if the download/upload fails.
 * This must be called during sync — not at enrichment time — to avoid expired URLs.
 */
async function downloadAndMirrorToR2(srmImageUrl: string): Promise<string | null> {
  try {
    // Fetch with SRM Supabase auth headers (required for private buckets / signed URLs)
    const res = await fetch(srmImageUrl, {
      headers: {
        'apikey': SRM_SUPABASE_KEY,
        'Authorization': `Bearer ${SRM_SUPABASE_KEY}`,
      },
    });

    if (!res.ok) {
      console.warn(`[SRM Image] Fetch failed ${res.status} for: ${srmImageUrl.slice(0, 120)}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mimeBase = contentType.split(';')[0].trim().toLowerCase();
    const ext = mimeBase.includes('png') ? 'png'
      : mimeBase.includes('webp') ? 'webp'
      : mimeBase.includes('gif') ? 'gif'
      : 'jpg';

    const buffer = Buffer.from(await res.arrayBuffer());
    const result = await storageService.uploadFile(buffer, `srm-image.${ext}`, mimeBase, 'srm-images');
    console.log(`[SRM Image] Mirrored to R2: ${result.url.slice(0, 80)}...`);
    return result.url;
  } catch (err: any) {
    console.warn(`[SRM Image] Mirror to R2 failed: ${err.message}`);
    return null;
  }
}

// Module-level schema cache — masterAttribute rows rarely change, no need to re-query
// for every single SRM record during a backfill run. Loaded once per process lifetime.
let cachedEnrichSchema: Array<{ key: string; label: string; type: any; allowedValues: string[] }> | null = null;

async function getEnrichSchema() {
  if (cachedEnrichSchema) return cachedEnrichSchema;
  const masterAttrs = await prisma.masterAttribute.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    include: {
      allowedValues: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } }
    }
  });
  cachedEnrichSchema = masterAttrs.map(attr => ({
    key: attr.key,
    label: attr.label || attr.key,
    type: attr.type.toLowerCase() as any,
    allowedValues: attr.allowedValues.map((av: any) => av.shortForm),
  }));
  return cachedEnrichSchema;
}

// How many pages to fetch in parallel per batch
const PAGE_BATCH_SIZE = 5;
// Max retries per page on transient failure
const PAGE_MAX_RETRIES = 3;

/**
 * Fetch one page from the SRM API with retry logic.
 */
async function fetchPage(page: number, retries = PAGE_MAX_RETRIES): Promise<SrmApiResponse> {
  const url = `${SRM_API_BASE}?page=${page}&page_size=${PAGE_SIZE}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'apikey': SRM_SUPABASE_KEY,
          'Authorization': `Bearer ${SRM_SUPABASE_KEY}`,
          'x-api-key': SRM_API_KEY,
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
      }
      const json = await res.json() as any;

      // Log API structure on first page so we can diagnose mismatches in server logs
      if (page === 1) {
        const keys = Object.keys(json).join(', ');
        const rowsLen = Array.isArray(json.rows) ? json.rows.length
          : Array.isArray(json.data) ? json.data.length : '?';
        console.log(`[SRM Sync] API page 1 — keys: [${keys}] | total=${json.total ?? json.count ?? '?'} | rows_in_page=${rowsLen}`);
      }

      // Normalise: support both 'rows'/'total' and 'data'/'count' response shapes
      const rows: SrmRow[] = Array.isArray(json.rows) ? json.rows
        : Array.isArray(json.data) ? json.data : [];
      const total: number = (typeof json.total === 'number' && json.total > 0) ? json.total
        : (typeof json.count === 'number' && json.count > 0) ? json.count
        : rows.length;

      return { page: json.page ?? page, page_size: json.page_size ?? PAGE_SIZE, total, rows };
    } catch (err: any) {
      if (attempt === retries) {
        throw new Error(`SRM API page ${page} failed after ${retries} attempts: ${err.message}`);
      }
      const delay = attempt * 1000; // 1s, 2s back-off
      console.warn(`[SRM Sync] Page ${page} attempt ${attempt} failed — retrying in ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  // Unreachable but satisfies TypeScript
  throw new Error(`SRM API page ${page}: exhausted retries`);
}

/**
 * Fetch all pages and return every row.
 * Pages are fetched in parallel batches of PAGE_BATCH_SIZE to balance speed vs rate limits.
 */
async function fetchAllRows(): Promise<SrmRow[]> {
  // Step 1: fetch page 1 to discover total record count
  const first = await fetchPage(1);
  const allRows: SrmRow[] = [...first.rows];

  // Guard: if total came back as 0 but we got rows, trust the rows (API quirk)
  const reportedTotal = first.total > 0 ? first.total : first.rows.length;
  const totalPages = Math.ceil(reportedTotal / PAGE_SIZE);

  if (totalPages <= 1) {
    console.log(`[SRM Sync] Single page — ${allRows.length} records fetched`);
    return allRows;
  }

  console.log(`[SRM Sync] ${reportedTotal} total records → ${totalPages} pages (batch size ${PAGE_BATCH_SIZE})`);

  // Step 2: fetch remaining pages in parallel batches
  for (let batchStart = 2; batchStart <= totalPages; batchStart += PAGE_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + PAGE_BATCH_SIZE - 1, totalPages);
    const pageNums = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);

    const pages = await Promise.all(pageNums.map(p => fetchPage(p)));
    for (const p of pages) allRows.push(...p.rows);

    console.log(`[SRM Sync] ✓ Pages ${batchStart}–${batchEnd} of ${totalPages} (${allRows.length}/${reportedTotal} rows so far)`);
  }

  console.log(`[SRM Sync] All pages fetched — ${allRows.length} total rows`);
  return allRows;
}

/**
 * Find an existing SRM record for this presentation_no + design_number pair.
 * Returns the record id and current imageUrl so we can patch the image if needed.
 */
async function findExisting(presentationNo: string, designNumber: string): Promise<{ id: string; imageUrl: string | null; vendorCode: string | null; vendorName: string | null } | null> {
  return prisma.extractionResultFlat.findFirst({
    where: {
      pptNumber: presentationNo,
      designNumber: designNumber,
      source: 'SRM',
    },
    select: { id: true, imageUrl: true, vendorCode: true, vendorName: true },
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

async function enrichSrmRowWithVlm(flatId: string, imageUrl: string, majorCategory: string | null): Promise<boolean> {
  try {
    console.log(`[SRM VLM] Starting enrichment for ${flatId} | category: ${majorCategory} | url: ${imageUrl.slice(0, 100)}`);

    // Pre-download the image to base64 before passing to VLM.
    const base64Image = await fetchImageAsBase64(imageUrl);
    if (!base64Image) {
      console.warn(`[SRM VLM] ❌ STEP 1 FAILED — image fetch returned null for ${flatId}. URL: ${imageUrl.slice(0, 120)}`);
      return false;
    }
    console.log(`[SRM VLM] ✓ Image fetched — base64 length: ${base64Image.length} chars`);

    // Use the module-level schema cache — avoids a full DB query for every record
    const schema = await getEnrichSchema();
    console.log(`[SRM VLM] ✓ Schema loaded — ${schema.length} attributes`);

    const result = await vlmService.extractFashionAttributes({
      image: base64Image,
      schema,
      categoryName: majorCategory || undefined,
      discoveryMode: false,
    });

    const nonNullAttrs = Object.entries(result.attributes || {})
      .filter(([, v]) => v !== null && (v as any)?.rawValue != null)
      .map(([k]) => k);
    console.log(`[SRM VLM] ✓ VLM complete — confidence: ${result.confidence}% | non-null attrs (${nonNullAttrs.length}): ${nonNullAttrs.join(', ') || 'NONE'} | model: ${result.modelUsed}`);

    const attrs = result.attributes || {};
    const get = (...keys: string[]): string | null => {
      for (const key of keys) {
        const attr = attrs[key];
        if (!attr) continue;
        const v = attr.schemaValue ?? attr.rawValue;
        const s = v != null ? String(v).trim() : '';
        // Skip empty strings AND dash-only values — VLM uses "-" to mean
        // "not visible / not applicable". Storing it causes "----TOP-RINSE" style
        // article descriptions and pollutes DB fields that should stay null.
        if (s !== '' && !/^-+$/.test(s)) return s;
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
      console.warn(`[SRM VLM] ❌ STEP 3 FAILED — VLM returned 0 usable attributes for ${flatId}. All attributes were null or failed allowed-value validation. Non-null attrs from VLM: [${nonNullAttrs.join(', ')}]`);
      return false;
    }

    // prisma.update returns the full updated record — no extra findUnique needed
    const updatedRow = await prisma.extractionResultFlat.update({ where: { id: flatId }, data: updates });

    // Rebuild article description with the newly populated fields
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
    return true;
  } catch (err: any) {
    console.error(`[SRM VLM] ❌ STEP 2 FAILED — exception during VLM call for ${flatId}:`, err.message);
    console.error(`[SRM VLM] Stack:`, err.stack);
    return false;
  }
}

/**
 * Insert one SRM row into the database. Returns the created flat record.
 */
async function insertRowAndReturn(row: SrmRow): Promise<{ id: string; imageUrl: string | null } | null> {
  return insertRow(row);
}

async function insertRow(row: SrmRow): Promise<{ id: string; imageUrl: string | null } | null> {
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
      isGeneric:      true,   // SRM records are standalone articles, not variants

      // SRM-provided fields
      pptNumber:      row.presentation_no || null,
      designNumber:   row.design_number   || null,
      vendorCode:     normaliseVendorCode(row.vendor_code),
      vendorName:     row.vendor_name     || null,
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
    vendorCode: flat.vendorCode, vendorName: flat.vendorName, division: flat.division,
    subDivision: flat.subDivision, majorCategory: flat.majorCategory,
    macroMvgr: flat.macroMvgr, rate: flat.rate,
    year: flat.year, season: flat.season, mcCode: flat.mcCode,
    hsnTaxCode: flat.hsnTaxCode, segment: flat.segment,
  });

  // NOTE: Do NOT call duplicateForKidsDivision for SRM records.
  // SRM provides the exact major category from the vendor — we must trust it as-is.
  // Duplication would create spurious sibling records (e.g. YBW_... alongside JBW_...).
  // Variant creation is also skipped for the same reason.

  // Mirror SRM image to R2 immediately so VLM enrichment gets a permanent, auth-free URL.
  // SRM image URLs are private Supabase storage or short-lived signed URLs — they expire
  // and cannot be fetched by the VLM provider without credentials.
  let finalImageUrl = flat.imageUrl;
  if (srmImageUrl) {
    const r2Url = await downloadAndMirrorToR2(srmImageUrl);
    if (r2Url) {
      finalImageUrl = r2Url;
      await prisma.extractionResultFlat.update({
        where: { id: flat.id },
        data: { imageUrl: r2Url },
      });
      void mirror360FlatUpdate(flat.id, { imageUrl: r2Url });
    }
  }

  return { id: flat.id, imageUrl: finalImageUrl };
}

/**
 * Main sync function. Call this from the route handler or cron job.
 */
export async function syncFromSrm(): Promise<SyncResult> {
  console.log('[SRM Sync] Starting sync from SRM API...');
  const startedAt = new Date().toISOString();
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

  // Collect IDs that need VLM enrichment — run AFTER the insert loop to avoid concurrent API calls
  const toEnrich: Array<{ id: string; imageUrl: string; majorCategory: string | null }> = [];

  for (const row of rows) {
    try {
      const existing = await findExisting(row.presentation_no, row.design_number);
      if (existing) {
        // Record exists — patch any fields the API now provides that we didn't have before
        const patch: Record<string, any> = {};
        if (row.image_url && !existing.imageUrl)
          patch.imageUrl = row.image_url;
        const normCode = normaliseVendorCode(row.vendor_code);
        if (normCode && existing.vendorCode !== normCode)
          patch.vendorCode = normCode;
        if (row.vendor_name && !existing.vendorName)
          patch.vendorName = row.vendor_name;

        if (Object.keys(patch).length > 0) {
          // Mirror new image to R2 before saving, same as insertRow path
          if (patch.imageUrl) {
            const r2Url = await downloadAndMirrorToR2(patch.imageUrl);
            if (r2Url) patch.imageUrl = r2Url;
          }
          await prisma.extractionResultFlat.update({ where: { id: existing.id }, data: patch });
          void mirror360FlatUpdate(existing.id, patch);
          if (patch.imageUrl) {
            toEnrich.push({ id: existing.id, imageUrl: patch.imageUrl, majorCategory: row.major_category || null });
          }
          console.log(`[SRM Sync] Patched fields [${Object.keys(patch).join(', ')}] for: ${row.presentation_no} / ${row.design_number}`);
          result.inserted++;
        } else {
          result.skipped++;
        }
        continue;
      }
      const flat = await insertRowAndReturn(row);
      result.inserted++;
      console.log(`[SRM Sync] Inserted: ${row.presentation_no} / ${row.design_number}`);
      if (flat && flat.imageUrl) {
        toEnrich.push({ id: flat.id, imageUrl: flat.imageUrl, majorCategory: row.major_category || null });
      }
    } catch (err: any) {
      result.errors++;
      console.error(`[SRM Sync] Error for ${row.presentation_no}/${row.design_number}:`, err.message);
    }
  }

  console.log(`[SRM Sync] Done — inserted: ${result.inserted}, skipped: ${result.skipped}, errors: ${result.errors}`);

  // Cache the result so the status endpoint can return it
  _lastSyncResult = { ...result, completedAt: new Date().toISOString(), ranAt: startedAt };

  // Enrich sequentially in the background with a delay between calls to avoid rate limits
  if (toEnrich.length > 0) {
    console.log(`[SRM Sync] Queuing VLM enrichment for ${toEnrich.length} records (sequential, ${VLM_ENRICH_DELAY_MS}ms gap)...`);
    void (async () => {
      let enriched = 0;
      for (const item of toEnrich) {
        await enrichSrmRowWithVlm(item.id, item.imageUrl, item.majorCategory);
        enriched++;
        if (enriched < toEnrich.length) {
          await new Promise(r => setTimeout(r, VLM_ENRICH_DELAY_MS));
        }
      }
      console.log(`[SRM Sync] VLM enrichment complete — ${enriched}/${toEnrich.length} processed`);
    })();
  }

  return result;
}

/**
 * Startup recovery enrichment — runs once when the server boots.
 *
 * Finds SRM records that were inserted within the last 48 hours but still have
 * extractionStatus = 'SRM_IMPORT' (meaning the fire-and-forget VLM background
 * task was killed before it finished, most likely due to a server restart).
 *
 * Scoped to the last 48 h only — genuinely old records are NEVER touched.
 * Runs entirely in the background; startup is not blocked.
 */
export async function recoverRecentSrmVlmEnrichment(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
  const records = await prisma.extractionResultFlat.findMany({
    where: {
      source: 'SRM',
      extractionStatus: 'SRM_IMPORT',
      imageUrl: { not: null },
      createdAt: { gte: cutoff },
    },
    select: { id: true, imageUrl: true, majorCategory: true },
    orderBy: { createdAt: 'asc' },
  });

  if (records.length === 0) {
    console.log('[SRM Recovery] No recent SRM_IMPORT records in last 48h — nothing to recover');
    return;
  }

  console.log(`[SRM Recovery] Found ${records.length} recent record(s) still at SRM_IMPORT — starting background recovery`);

  // Run entirely in the background — does not block server startup
  void (async () => {
    let enriched = 0;
    let failed = 0;
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec.imageUrl) continue;
      try {
        const success = await enrichSrmRowWithVlm(rec.id, rec.imageUrl, rec.majorCategory);
        if (success) enriched++; else failed++;
      } catch {
        failed++;
      }
      if (i < records.length - 1) {
        await new Promise(r => setTimeout(r, VLM_ENRICH_DELAY_MS));
      }
    }
    console.log(`[SRM Recovery] Complete — enriched: ${enriched}, failed: ${failed} (of ${records.length})`);
  })();
}

/**
 * Backfill VLM enrichment for all SRM records that have an imageUrl
 * but are still at SRM_IMPORT status. Runs sequentially to avoid rate limits.
 * Exported for the admin panel manual trigger.
 */
export async function backfillSrmVlmEnrichment(): Promise<EnrichResult> {
  const records = await prisma.extractionResultFlat.findMany({
    where: {
      source: 'SRM',
      extractionStatus: 'SRM_IMPORT',
      imageUrl: { not: null },
    },
    select: { id: true, imageUrl: true, majorCategory: true },
    orderBy: { createdAt: 'asc' },
  });

  const result: EnrichResult = { processed: records.length, enriched: 0, failed: 0 };
  console.log(`[SRM Enrich Backfill] Starting — ${records.length} records to process`);

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec.imageUrl) continue;

    // If the stored URL is still an SRM Supabase URL (not yet mirrored to R2),
    // re-download and mirror it now so VLM gets a permanent accessible URL.
    let imageUrl = rec.imageUrl;
    if (imageUrl.includes('supabase.co/storage')) {
      const r2Url = await downloadAndMirrorToR2(imageUrl);
      if (r2Url) {
        imageUrl = r2Url;
        await prisma.extractionResultFlat.update({
          where: { id: rec.id },
          data: { imageUrl: r2Url },
        });
        void mirror360FlatUpdate(rec.id, { imageUrl: r2Url });
        console.log(`[SRM Enrich Backfill] Re-mirrored SRM image to R2 for ${rec.id}`);
      } else {
        console.warn(`[SRM Enrich Backfill] Could not re-mirror image for ${rec.id} — skipping VLM`);
        result.failed++;
        continue;
      }
    }

    try {
      const success = await enrichSrmRowWithVlm(rec.id, imageUrl, rec.majorCategory);
      if (success) {
        result.enriched++;
      } else {
        result.failed++;
      }
    } catch {
      result.failed++;
    }
    if (i < records.length - 1) {
      await new Promise(r => setTimeout(r, VLM_ENRICH_DELAY_MS));
    }
  }

  console.log(`[SRM Enrich Backfill] Done — enriched: ${result.enriched}, failed/no-change: ${result.failed}`);
  return result;
}

// ─── Single Presentation Fetch ─────────────────────────────────────────────

const SRM_BY_REF_API = 'https://pymdqnnwwxrgeolvgvgv.supabase.co/functions/v1/srm-presentation-by-ref';

interface SrmByRefImage {
  id: string;
  design_number: string;
  fabric: string;
  no_of_colors: number;
  price: number;
  quantity: number | null;
  available_date: string | null;
  image_url: string | null;
  cost_sheet_url: string | null;
  notes: string | null;
  uploaded_at: string;
  latest_decision: string | null;
}

interface SrmByRefResponse {
  presentation: {
    id: string;
    ref_no: string;
    status: string;
    vendor_code: string;
    vendor_name: string;
    division: string;
    sub_division: string;
    major_category: string;
    category_head_decision: string | null;
    subdivision_head_decision: string | null;
    received_at: string | null;
    approved_at: string | null;
    created_at: string;
  };
  images: SrmByRefImage[];
  image_count: number;
}

export interface SinglePptSyncResult {
  refNo: string;
  imageCount: number;
  inserted: number;
  skipped: number;
  errors: number;
  vlmQueued: number;
}

/**
 * Fetch a single SRM presentation by ref_no (PPT number) and insert/patch
 * its images into extraction_results_flat — same logic as bulk sync but
 * for one presentation only. VLM enrichment runs in background.
 */
export async function syncSinglePresentation(
  refNo: string,
  approvedOnly = false,
): Promise<SinglePptSyncResult> {
  console.log(`[SRM Single] Fetching presentation: ${refNo}`);

  const url = new URL(SRM_BY_REF_API);
  url.searchParams.set('ref_no', refNo);
  if (approvedOnly) url.searchParams.set('approved_only', 'true');

  const res = await fetch(url.toString(), {
    headers: {
      'apikey': SRM_SUPABASE_KEY,
      'Authorization': `Bearer ${SRM_SUPABASE_KEY}`,
      'x-api-key': SRM_API_KEY,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SRM API error: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  const json = await res.json() as SrmByRefResponse;
  const { presentation, images } = json;

  const result: SinglePptSyncResult = {
    refNo,
    imageCount: images.length,
    inserted: 0,
    skipped: 0,
    errors: 0,
    vlmQueued: 0,
  };

  const toEnrich: Array<{ id: string; imageUrl: string; majorCategory: string | null }> = [];

  for (const img of images) {
    try {
      // Build an SrmRow compatible with insertRow()
      const row: SrmRow = {
        presentation_no: presentation.ref_no,
        vendor_code:     presentation.vendor_code,
        vendor_name:     presentation.vendor_name || null,
        division:        presentation.division,
        sub_division:    presentation.sub_division,
        major_category:  presentation.major_category,
        presentation_received_date: presentation.received_at || presentation.created_at,
        design_number:   img.design_number || img.id,
        fabric:          img.fabric || '',
        no_of_colors:    img.no_of_colors ?? 0,
        price:           img.price ?? 0,
        image_url:       img.image_url || null,
      };

      const existing = await findExisting(row.presentation_no, row.design_number);
      if (existing) {
        if (row.image_url && !existing.imageUrl) {
          // Mirror to R2 first so the stored URL is permanent
          const r2Url = await downloadAndMirrorToR2(row.image_url);
          const finalUrl = r2Url || row.image_url;
          await prisma.extractionResultFlat.update({
            where: { id: existing.id },
            data: { imageUrl: finalUrl },
          });
          void mirror360FlatUpdate(existing.id, { imageUrl: finalUrl });
          toEnrich.push({ id: existing.id, imageUrl: finalUrl, majorCategory: presentation.major_category });
          result.inserted++;
        } else {
          result.skipped++;
        }
        continue;
      }

      const flat = await insertRow(row);
      result.inserted++;
      console.log(`[SRM Single] Inserted: ${row.presentation_no} / ${row.design_number}`);
      if (flat?.imageUrl) {
        toEnrich.push({ id: flat.id, imageUrl: flat.imageUrl, majorCategory: presentation.major_category });
      }
    } catch (err: any) {
      result.errors++;
      console.error(`[SRM Single] Error for image ${img.id}:`, err.message);
    }
  }

  result.vlmQueued = toEnrich.length;
  console.log(`[SRM Single] Done — inserted:${result.inserted} skipped:${result.skipped} errors:${result.errors} vlmQueued:${result.vlmQueued}`);

  // VLM enrichment in background
  if (toEnrich.length > 0) {
    void (async () => {
      for (let i = 0; i < toEnrich.length; i++) {
        await enrichSrmRowWithVlm(toEnrich[i].id, toEnrich[i].imageUrl, toEnrich[i].majorCategory);
        if (i < toEnrich.length - 1) await new Promise(r => setTimeout(r, VLM_ENRICH_DELAY_MS));
      }
      console.log(`[SRM Single] VLM enrichment complete for ${refNo} — ${toEnrich.length} images`);
    })();
  }

  return result;
}

// ─── SRM Webhook Batch Processing ─────────────────────────────────────────

/**
 * One image entry as sent by the SRM web app in the webhook request body.
 */
export interface SrmWebhookImage {
  design_number: string;
  image_url?: string | null;
  price?: number;
  fabric?: string;
  no_of_colors?: number;
}

/**
 * Full request body shape expected from the SRM web app.
 */
export interface SrmWebhookBatchRequest {
  presentation_no: string;
  vendor_code: string;
  vendor_name?: string | null;
  division: string;
  sub_division?: string | null;
  major_category: string;
  presentation_received_date?: string | null;
  images: SrmWebhookImage[];
}

/**
 * Progress update emitted after each image is processed.
 * The controller uses this to update the in-memory job store.
 */
export interface SrmWebhookProgress {
  designNumber: string;
  id?: string;
  success: boolean;
  extractionStatus?: string;
  articleDescription?: string;
  error?: string;
}

export type SrmWebhookProgressCallback = (progress: SrmWebhookProgress) => void;

/**
 * Process a batch of SRM images received via the webhook endpoint.
 *
 * Runs SEQUENTIALLY (one image at a time) to respect Gemini rate limits.
 * Calls onProgress after each image so the caller can update job state.
 *
 * This function is designed to be called inside a fire-and-forget wrapper —
 * the HTTP response (202) must already have been sent before calling this.
 *
 * Does NOT touch cron-job logic or manual-trigger logic — purely additive.
 */
export async function processSrmWebhookBatch(
  req: SrmWebhookBatchRequest,
  onProgress: SrmWebhookProgressCallback,
): Promise<void> {
  console.log(`[SRM Hook] Batch started — presentation: ${req.presentation_no} | images: ${req.images.length}`);

  for (let i = 0; i < req.images.length; i++) {
    const img = req.images[i];
    const designNumber = (img.design_number || `img-${i + 1}`).trim();

    try {
      // Build SrmRow compatible with insertRow()
      const row: SrmRow = {
        presentation_no:            req.presentation_no,
        vendor_code:                req.vendor_code,
        vendor_name:                req.vendor_name  || null,
        division:                   req.division,
        sub_division:               req.sub_division || '',
        major_category:             req.major_category,
        presentation_received_date: req.presentation_received_date || new Date().toISOString(),
        design_number:              designNumber,
        fabric:                     img.fabric       || '',
        no_of_colors:               img.no_of_colors ?? 0,
        price:                      img.price        ?? 0,
        image_url:                  img.image_url    || null,
      };

      // ── 1. Insert or locate existing DB record ──────────────────────────
      const existing = await findExisting(req.presentation_no, designNumber);
      let flatId: string;
      let imageUrl: string | null;

      if (existing) {
        flatId   = existing.id;
        imageUrl = existing.imageUrl;

        // If this call now provides an image URL we didn't have before — mirror it
        if (img.image_url && !existing.imageUrl) {
          const r2Url = await downloadAndMirrorToR2(img.image_url);
          if (r2Url) {
            imageUrl = r2Url;
            await prisma.extractionResultFlat.update({ where: { id: flatId }, data: { imageUrl: r2Url } });
            void mirror360FlatUpdate(flatId, { imageUrl: r2Url });
          }
        }
        console.log(`[SRM Hook] Existing record for ${designNumber} — id: ${flatId}`);
      } else {
        const flat = await insertRow(row);
        if (!flat) throw new Error('insertRow returned null');
        flatId   = flat.id;
        imageUrl = flat.imageUrl;
        console.log(`[SRM Hook] Inserted new record for ${designNumber} — id: ${flatId}`);
      }

      // ── 2. VLM Extraction ────────────────────────────────────────────────
      if (!imageUrl) {
        console.warn(`[SRM Hook] No image URL for ${designNumber} — skipping VLM`);
        onProgress({ designNumber, id: flatId, success: false, extractionStatus: 'SRM_IMPORT', error: 'No image URL' });
        continue;
      }

      const success = await enrichSrmRowWithVlm(flatId, imageUrl, req.major_category);

      // ── 3. Fetch final DB state for the progress report ──────────────────
      const final = await prisma.extractionResultFlat.findUnique({
        where:  { id: flatId },
        select: { extractionStatus: true, articleDescription: true },
      });

      onProgress({
        designNumber,
        id:                 flatId,
        success,
        extractionStatus:   final?.extractionStatus   ?? (success ? 'COMPLETED' : 'SRM_IMPORT'),
        articleDescription: final?.articleDescription  ?? undefined,
      });

    } catch (err: any) {
      console.error(`[SRM Hook] Error for ${designNumber}:`, err.message);
      onProgress({ designNumber, success: false, error: err.message });
    }

    // Rate-limit gap between consecutive Gemini calls (skip after last image)
    if (i < req.images.length - 1) {
      await new Promise(r => setTimeout(r, VLM_ENRICH_DELAY_MS));
    }
  }

  console.log(`[SRM Hook] Batch complete — presentation: ${req.presentation_no}`);
}
