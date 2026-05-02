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
 */

import { prisma } from '../utils/prisma';
import { getHsnCodeByMcCode, getMcCodeByMajorCategory } from '../utils/mcCodeMapper';
import { getSegmentByCategoryAndMrp } from '../utils/segmentRangeMapper';
import { buildArticleDescription } from '../utils/articleDescriptionBuilder';
import { mirror360FlatUpdate } from '../utils/mirror360Flat';
import { duplicateForKidsDivision } from '../services/kidsDivisionDuplicationService';
import { createVariantsForGeneric } from '../services/variantCreationService';

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
 * Check if we already have a record for this presentation_no + design_number pair.
 */
async function isDuplicate(presentationNo: string, designNumber: string): Promise<boolean> {
  const existing = await prisma.extractionResultFlat.findFirst({
    where: {
      pptNumber: presentationNo,
      designNumber: designNumber,
      source: 'SRM',
    },
    select: { id: true },
  });
  return !!existing;
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
 * Insert one SRM row into the database.
 */
async function insertRow(row: SrmRow): Promise<void> {
  const categoryId = await resolveCategoryId(row.major_category, row.division);

  // Create ExtractionJob (required by FK; no AI used — just a shell record)
  const job = await prisma.extractionJob.create({
    data: {
      categoryId,
      imageUrl: '',           // No image from SRM
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
      imageUrl:       null,

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

  // Kids duplication + variant creation (fire-and-forget, same as watcher)
  void duplicateForKidsDivision(flat.id);
  void createVariantsForGeneric(flat.id);
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
      const dup = await isDuplicate(row.presentation_no, row.design_number);
      if (dup) {
        result.skipped++;
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
