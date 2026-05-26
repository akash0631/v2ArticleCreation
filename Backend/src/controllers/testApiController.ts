/**
 * Test API Controller
 *
 * Fetches a single SRM presentation by PPT No and stores the raw data
 * into the raw_articles staging table with status PENDING.
 * No VLM extraction is triggered — this is a pure data ingestion test.
 *
 * POST /api/test-api/fetch-presentation   { "ppt_no": "PRES-00831" }
 * GET  /api/test-api/raw-articles         ?ppt_no=PRES-00831
 */

import { Request, Response } from 'express';
import { prismaClient as prisma } from '../utils/prisma';

const SRM_BY_REF_API = 'https://pymdqnnwwxrgeolvgvgv.supabase.co/functions/v1/srm-presentation-by-ref';
const SRM_API_KEY = process.env.SRM_API_KEY || 'v2@123';
const SRM_SUPABASE_KEY =
  process.env.SRM_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bWRxbm53d3hyZ2VvbHZndmd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMzU0NzYsImV4cCI6MjA2ODkxMTQ3Nn0.jUrb0jIg6qjj2Rlh9DxYesSnbstoD4uoDCswqOqAkUM';

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

/**
 * POST /api/test-api/fetch-presentation
 *
 * Fetches the presentation from SRM API and upserts each image row
 * into raw_articles with status PENDING (no extraction triggered).
 *
 * Dedup key: unique_key = presentation_no + image_url
 * If a row with the same unique_key already exists it is SKIPPED (not updated).
 */
export const fetchPresentationToRaw = async (req: Request, res: Response): Promise<void> => {
  const { ppt_no } = req.body as { ppt_no?: string };

  if (!ppt_no?.trim()) {
    res.status(400).json({ success: false, error: 'ppt_no is required' });
    return;
  }

  const pptNo = ppt_no.trim().toUpperCase();

  // ── Fetch from SRM API ────────────────────────────────────────────────────
  const url = new URL(SRM_BY_REF_API);
  url.searchParams.set('ref_no', pptNo);

  let srmData: SrmByRefResponse;
  try {
    const fetchRes = await fetch(url.toString(), {
      headers: {
        apikey: SRM_SUPABASE_KEY,
        Authorization: `Bearer ${SRM_SUPABASE_KEY}`,
        'x-api-key': SRM_API_KEY,
      },
    });

    if (!fetchRes.ok) {
      const body = await fetchRes.text().catch(() => '');
      res.status(502).json({
        success: false,
        error: `SRM API error: HTTP ${fetchRes.status} — ${body.slice(0, 300)}`,
      });
      return;
    }

    srmData = (await fetchRes.json()) as SrmByRefResponse;
  } catch (err: any) {
    res.status(502).json({
      success: false,
      error: `Failed to reach SRM API: ${err.message}`,
    });
    return;
  }

  const { presentation, images } = srmData;

  if (!images || images.length === 0) {
    res.json({
      success: true,
      ppt_no: pptNo,
      imageCount: 0,
      inserted: 0,
      skipped: 0,
      errors: 0,
      message: 'Presentation found but has no images.',
    });
    return;
  }

  // ── Upsert each image into raw_articles ───────────────────────────────────
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const img of images) {
    try {
      const uniqueKey = `${pptNo}::${img.image_url ?? img.id}`;

      // Skip-on-conflict: if unique_key already exists, leave existing row untouched
      const existing = await prisma.rawArticle.findUnique({
        where: { uniqueKey },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.rawArticle.create({
        data: {
          presentationNo:           pptNo,
          vendorCode:               presentation.vendor_code  || null,
          vendorName:               presentation.vendor_name  || null,
          division:                 presentation.division     || null,
          subDivision:              presentation.sub_division || null,
          majorCategory:            presentation.major_category || null,
          presentationReceivedDate: presentation.received_at
            ? new Date(presentation.received_at)
            : presentation.created_at
            ? new Date(presentation.created_at)
            : null,
          designNumber:   img.design_number || img.id || null,
          fabric:         img.fabric        || null,
          noOfColors:     img.no_of_colors  ?? null,
          price:          img.price != null ? img.price : null,
          imageUrl:       img.image_url     || null,
          uniqueKey,
          status:         'PENDING',
        },
      });

      inserted++;
    } catch (err: any) {
      errors++;
      console.error(`[TestAPI] Error inserting raw_article for ${pptNo}/${img.design_number}:`, err.message);
    }
  }

  console.log(
    `[TestAPI] fetch-presentation ${pptNo} — inserted: ${inserted} | skipped: ${skipped} | errors: ${errors}`,
  );

  res.json({
    success: true,
    ppt_no:     pptNo,
    imageCount: images.length,
    inserted,
    skipped,
    errors,
    message: `${inserted} new row(s) saved to raw_articles with status PENDING.`,
    presentation: {
      vendor_code:    presentation.vendor_code,
      vendor_name:    presentation.vendor_name,
      division:       presentation.division,
      sub_division:   presentation.sub_division,
      major_category: presentation.major_category,
      status:         presentation.status,
    },
  });
};

/**
 * GET /api/test-api/raw-articles?ppt_no=PRES-00831
 *
 * Returns all raw_articles rows for a given presentation number,
 * ordered by created_at desc.
 */
export const getRawArticles = async (req: Request, res: Response): Promise<void> => {
  const pptNo = (req.query.ppt_no as string | undefined)?.trim().toUpperCase();

  const where = pptNo ? { presentationNo: pptNo } : {};

  const rows = await prisma.rawArticle.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  res.json({
    success: true,
    total: rows.length,
    ppt_no: pptNo ?? null,
    data: rows,
  });
};
