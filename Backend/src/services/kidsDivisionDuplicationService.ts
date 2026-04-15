/**
 * Kids Division Duplication Service
 *
 * After an ExtractionResultFlat record is saved for the KIDS division,
 * this service looks up the record's MAJ_CAT in the Excel mapping file
 * (Backend/data/kids-division-mapping.xlsx) to find its NAME group.
 * For every OTHER MAJ_CAT that shares the same NAME, it creates a copy
 * of the original record with the new MAJ_CAT and SUB-DIV, and re-uploads
 * the image to Cloudflare R2 so each copy has its own independent URL/key.
 */

import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { prismaClient as prisma } from '../utils/prisma';
import { storageService } from './storageService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KidsMappingRow {
  'SUB-DIV': string;
  MAJ_CAT: string;
  NAME: string;
}

interface SiblingMapping {
  subDiv: string;
  majCat: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Excel loading (cached after first read so we don't hit disk on every call)
// ---------------------------------------------------------------------------

let cachedMappings: KidsMappingRow[] | null = null;

function loadKidsMappings(): KidsMappingRow[] {
  if (cachedMappings) return cachedMappings;

  const excelPath = path.resolve(__dirname, '../../data/kids-division-mapping.xlsx');

  if (!fs.existsSync(excelPath)) {
    console.warn(`[KidsDuplication] Excel file not found at ${excelPath}`);
    cachedMappings = [];
    return cachedMappings;
  }

  try {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<KidsMappingRow>(worksheet);
    cachedMappings = rows;
    console.log(`[KidsDuplication] Loaded ${rows.length} rows from kids-division-mapping.xlsx`);
    return cachedMappings;
  } catch (err) {
    console.error('[KidsDuplication] Failed to load Excel mapping file:', err);
    cachedMappings = [];
    return cachedMappings;
  }
}

// ---------------------------------------------------------------------------
// Helper: normalise the division string so KIDS / KID / kids all match
// ---------------------------------------------------------------------------

function isKidsDivision(division: string | null | undefined): boolean {
  if (!division) return false;
  const norm = division.trim().toUpperCase();
  return norm === 'KIDS' || norm === 'KID';
}

// ---------------------------------------------------------------------------
// Helper: find siblings for a given MAJ_CAT
// Returns all mapping rows that share the same NAME but have a different MAJ_CAT
// ---------------------------------------------------------------------------

function findSiblings(majCat: string, mappings: KidsMappingRow[]): SiblingMapping[] {
  const sourceMajCat = (majCat || '').trim().toUpperCase();

  // Find the NAME for the source MAJ_CAT
  const sourceRow = mappings.find(
    (r) => (r.MAJ_CAT || '').trim().toUpperCase() === sourceMajCat
  );

  if (!sourceRow) {
    console.log(`[KidsDuplication] MAJ_CAT '${majCat}' not found in Excel mapping — skipping duplication`);
    return [];
  }

  const sourceName = (sourceRow.NAME || '').trim().toUpperCase();

  // All rows with same NAME but different MAJ_CAT
  const siblings = mappings
    .filter(
      (r) =>
        (r.NAME || '').trim().toUpperCase() === sourceName &&
        (r.MAJ_CAT || '').trim().toUpperCase() !== sourceMajCat
    )
    .map((r) => ({
      subDiv: r['SUB-DIV'],
      majCat: r.MAJ_CAT,
      name: r.NAME,
    }));

  console.log(
    `[KidsDuplication] Found ${siblings.length} sibling(s) for MAJ_CAT='${majCat}' (NAME='${sourceRow.NAME}')`
  );

  return siblings;
}

// ---------------------------------------------------------------------------
// Helper: re-upload image from URL to R2 with a new unique key
// ---------------------------------------------------------------------------

async function reuseOrCopyImageToR2(sourceImageUrl: string): Promise<string> {
  // Fetch the image bytes from the source URL (which is our own R2 CDN/signed URL)
  let response: Response;
  try {
    response = await fetch(sourceImageUrl);
  } catch (fetchErr: any) {
    throw new Error(
      `[KidsDuplication] Failed to fetch source image for re-upload: ${fetchErr?.message || fetchErr}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `[KidsDuplication] Source image fetch returned HTTP ${response.status} for URL: ${sourceImageUrl}`
    );
  }

  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  const ext =
    mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
      ? 'webp'
      : 'jpg';

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const fakeOriginalName = `kids-dup-${randomUUID()}.${ext}`;

  const uploadResult = await storageService.uploadFile(
    imageBuffer,
    fakeOriginalName,
    mimeType,
    'fashion-images'
  );

  console.log(
    `[KidsDuplication] Re-uploaded image to R2: ${uploadResult.key} → ${uploadResult.url}`
  );

  return uploadResult.url;
}

// ---------------------------------------------------------------------------
// Main export: duplicateForKidsDivision
// ---------------------------------------------------------------------------

/**
 * Given a freshly-saved ExtractionResultFlat record (identified by its DB id),
 * this function:
 *  1. Checks if the record's division is KIDS/KID.
 *  2. Looks up siblings in the Excel mapping.
 *  3. For each sibling, clones the record with a new MAJ_CAT + SUB-DIV and
 *     a newly-uploaded copy of the image in R2.
 *
 * The function is designed to be called fire-and-forget (no await at call site)
 * so it wraps itself in a top-level try/catch and logs instead of throwing.
 */
export async function duplicateForKidsDivision(flatId: string): Promise<void> {
  try {
    // ── 1. Fetch the original record ────────────────────────────────────────
    const original = await prisma.extractionResultFlat.findUnique({
      where: { id: flatId },
    });

    if (!original) {
      console.warn(`[KidsDuplication] Record ${flatId} not found — skipping`);
      return;
    }

    // ── 2. Check division ───────────────────────────────────────────────────
    if (!isKidsDivision(original.division)) {
      // Not a kids record — nothing to do
      return;
    }

    console.log(
      `[KidsDuplication] Kids record detected (id=${flatId}, division=${original.division}, majCat=${original.majorCategory})`
    );

    // ── 3. Must have a MAJ_CAT to look up ──────────────────────────────────
    if (!original.majorCategory) {
      console.warn(`[KidsDuplication] Record ${flatId} has no majorCategory — skipping duplication`);
      return;
    }

    // ── 4. Load Excel and find siblings ────────────────────────────────────
    const mappings = loadKidsMappings();
    const siblings = findSiblings(original.majorCategory, mappings);

    if (siblings.length === 0) {
      console.log(`[KidsDuplication] No siblings found for '${original.majorCategory}' — nothing to duplicate`);
      return;
    }

    // ── 5. For each sibling create a copy ──────────────────────────────────
    for (const sibling of siblings) {
      try {
        console.log(
          `[KidsDuplication] Creating copy for sibling MAJ_CAT='${sibling.majCat}' SUB-DIV='${sibling.subDiv}'`
        );

        // Re-upload image to R2 so each copy has its own independent URL
        let newImageUrl = original.imageUrl;
        if (original.imageUrl) {
          try {
            newImageUrl = await reuseOrCopyImageToR2(original.imageUrl);
          } catch (imgErr: any) {
            console.error(
              `[KidsDuplication] Image re-upload failed for sibling '${sibling.majCat}': ${imgErr.message} — using original URL as fallback`
            );
            // Fallback: reuse original URL (not ideal but better than failing the whole record)
            newImageUrl = original.imageUrl;
          }
        }

        // Build the data for the new record.
        // We need to create a new ExtractionJob first because ExtractionResultFlat
        // has a unique FK to ExtractionJob (jobId is @unique).
        // Strategy: create a synthetic ExtractionJob that mirrors the original job's
        // key fields, then create the flat row pointing to it.

        // Fetch the original job to get its category
        const originalJob = await prisma.extractionJob.findUnique({
          where: { id: original.jobId },
          select: { categoryId: true, userId: true, aiModel: true },
        });

        if (!originalJob) {
          console.warn(`[KidsDuplication] Original job ${original.jobId} not found — skipping sibling '${sibling.majCat}'`);
          continue;
        }

        // Create a new synthetic ExtractionJob for this copy
        const newJob = await prisma.extractionJob.create({
          data: {
            userId: originalJob.userId,
            categoryId: originalJob.categoryId,
            imageUrl: newImageUrl || '',
            status: 'COMPLETED',
            aiModel: originalJob.aiModel,
            processingTimeMs: original.processingTimeMs,
            tokensUsed: original.totalTokens,
            inputTokens: original.inputTokens,
            outputTokens: original.outputTokens,
            apiCost: original.apiCost,
            totalAttributes: original.totalAttributes,
            extractedCount: original.extractedCount,
            avgConfidence: original.avgConfidence,
            completedAt: new Date(),
            designNumber: original.articleNumber,
          },
        });

        // Create the flat record as a clone with overridden fields
        // Destructure to omit the PK (id), jobId, imageUrl, majorCategory, subDivision,
        // imageUncPath (must be unique or null), createdAt, updatedAt (auto-managed),
        // and approval/SAP fields (reset to defaults).
        const {
          id: _id,
          jobId: _jobId,
          imageUrl: _imageUrl,
          majorCategory: _majorCategory,
          subDivision: _subDivision,
          imageUncPath: _imageUncPath,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          approvalStatus: _approvalStatus,
          approvedBy: _approvedBy,
          approvedAt: _approvedAt,
          sapSyncStatus: _sapSyncStatus,
          sapArticleId: _sapArticleId,
          sapSyncMessage: _sapSyncMessage,
          ...rest
        } = original;

        await prisma.extractionResultFlat.create({
          data: {
            ...rest,
            // New unique identifiers
            id: randomUUID(),
            jobId: newJob.id,
            // Updated image
            imageUrl: newImageUrl,
            // Kids mapping overrides — always explicit so copies are never wrong
            division: 'KIDS',
            majorCategory: sibling.majCat,
            subDivision: sibling.subDiv,
            // Approval/SAP reset to defaults
            approvalStatus: 'PENDING',
            approvedBy: null,
            approvedAt: null,
            sapSyncStatus: 'NOT_SYNCED',
            sapArticleId: null,
            sapSyncMessage: null,
            // imageUncPath must be null (unique constraint — each record must be unique)
            imageUncPath: null,
          },
        });

        console.log(
          `[KidsDuplication] Created duplicate for MAJ_CAT='${sibling.majCat}' SUB-DIV='${sibling.subDiv}' (jobId=${newJob.id})`
        );
      } catch (siblingErr: any) {
        // Don't let one sibling failure stop the others
        console.error(
          `[KidsDuplication] Error creating duplicate for sibling '${sibling.majCat}':`,
          siblingErr?.message || siblingErr
        );
      }
    }

    console.log(`[KidsDuplication] Duplication complete for flatId=${flatId}`);
  } catch (err: any) {
    // Top-level guard — never propagate errors to the caller
    console.error('[KidsDuplication] Unexpected error in duplicateForKidsDivision:', err?.message || err);
  }
}
