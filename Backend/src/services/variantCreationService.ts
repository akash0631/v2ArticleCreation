/**
 * Variant Creation Service
 *
 * After a generic ExtractionResultFlat is created, this service reads
 * variant-sizes-mapping.xlsx to find all sizes for the MAJ_CAT and
 * creates size variant copies of the generic article.
 */
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { prismaClient as prisma } from '../utils/prisma';
import { upsert360ArticleFlatRow, mirror360FlatUpdate } from '../utils/mirror360Flat';

type ActiveSizeMappingRow = Record<string, unknown>;

let cachedActiveSizeMappings: ActiveSizeMappingRow[] | null = null;

function loadActiveSizeMappings(): ActiveSizeMappingRow[] {
  if (cachedActiveSizeMappings) return cachedActiveSizeMappings;
  const excelPath = path.resolve(__dirname, '../data/active-size-mapping.xlsx');
  if (!fs.existsSync(excelPath)) {
    console.warn('[VariantCreation] active-size-mapping.xlsx not found at', excelPath);
    cachedActiveSizeMappings = [];
    return cachedActiveSizeMappings;
  }
  try {
    const wb = XLSX.readFile(excelPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    // range:2 skips the title row and blank row; row 3 (index 2) has the real headers: DIV, MAJCAT, SIZE
    cachedActiveSizeMappings = XLSX.utils.sheet_to_json<ActiveSizeMappingRow>(ws, { range: 2 });
    console.log(`[VariantCreation] Loaded ${cachedActiveSizeMappings.length} active size mapping rows`);
    return cachedActiveSizeMappings;
  } catch (err) {
    console.error('[VariantCreation] Failed to load active-size-mapping.xlsx:', err);
    cachedActiveSizeMappings = [];
    return cachedActiveSizeMappings;
  }
}

// Extract MAJ_CAT value — column is named MAJCAT in active-size-mapping.xlsx
function getMajCatFromRow(row: ActiveSizeMappingRow): string {
  const val = row['MAJCAT'] ?? row['MAJ_CAT'] ?? row['MajCat'];
  return String(val ?? '').trim().toUpperCase();
}

// Extract size value — column is named SIZE in active-size-mapping.xlsx
function getSizeFromRow(row: ActiveSizeMappingRow): string {
  const val = row['SIZE'] ?? row['SZ'] ?? row['Size'];
  return String(val ?? '').trim();
}

export function getSizesForMajCat(majCat: string): string[] {
  const upper = majCat.trim().toUpperCase();
  const activeMappings = loadActiveSizeMappings();
  return Array.from(new Set(
    activeMappings
      .filter(r => getMajCatFromRow(r) === upper)
      .map(r => getSizeFromRow(r))
      .filter(Boolean)
  ));
}

// Fields that should NOT be synced from generic to variants (variant-specific)
export const VARIANT_ONLY_FIELDS = ['variantSize', 'variantColor', 'size', 'colour'];

export async function createVariantsForGeneric(genericId: string): Promise<void> {
  try {
    const generic = await prisma.extractionResultFlat.findUnique({ where: { id: genericId } });
    if (!generic || !generic.majorCategory) return;
    if (!generic.isGeneric) return;

    const sizes = getSizesForMajCat(generic.majorCategory);
    if (sizes.length === 0) {
      console.log(`[VariantCreation] No sizes found for ${generic.majorCategory}`);
      return;
    }

    console.log(`[VariantCreation] Creating ${sizes.length} variants for ${generic.majorCategory}`);

    const {
      id: _id, jobId: _jobId, imageUncPath: _unc, createdAt: _ca, updatedAt: _ua,
      approvalStatus: _as, approvedBy: _ab, approvedAt: _aat,
      sapSyncStatus: _sss, sapArticleId: _sai, sapSyncMessage: _ssm,
      isGeneric: _ig, genericArticleId: _gai, variantSize: _vs, variantColor: _vc,
      ...rest
    } = generic;

    // Get original job to create new jobs for each variant
    const originalJob = await prisma.extractionJob.findUnique({
      where: { id: generic.jobId },
      select: { categoryId: true, userId: true, aiModel: true }
    });
    if (!originalJob) return;

    for (const size of sizes) {
      try {
        const newJob = await prisma.extractionJob.create({
          data: {
            userId: originalJob.userId,
            categoryId: originalJob.categoryId,
            imageUrl: generic.imageUrl || '',
            status: 'COMPLETED',
            aiModel: originalJob.aiModel,
            processingTimeMs: generic.processingTimeMs,
            tokensUsed: generic.totalTokens,
            inputTokens: generic.inputTokens,
            outputTokens: generic.outputTokens,
            apiCost: generic.apiCost,
            totalAttributes: generic.totalAttributes,
            extractedCount: generic.extractedCount,
            avgConfidence: generic.avgConfidence,
            completedAt: new Date(),
            designNumber: generic.articleNumber,
          }
        });

        const variantId = randomUUID();
        const variantData = {
          ...rest,
          id: variantId,
          jobId: newJob.id,
          imageUncPath: null,
          approvalStatus: 'PENDING' as const,
          approvedBy: null,
          approvedAt: null,
          sapSyncStatus: 'NOT_SYNCED' as const,
          sapArticleId: null,
          sapSyncMessage: null,
          isGeneric: false,
          genericArticleId: genericId,
          variantSize: size,
          size: size,
          colour: generic.colour || null,
          variantColor: generic.colour || null,
        };
        await prisma.extractionResultFlat.create({ data: variantData });

        // Mirror to 360article (fire-and-forget)
        void upsert360ArticleFlatRow(variantId, variantData as Record<string, unknown>);

        console.log(`[VariantCreation] Created variant size=${size} for generic=${genericId}`);
      } catch (err: any) {
        console.error(`[VariantCreation] Failed for size ${size}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[VariantCreation] Unexpected error:', err?.message);
  }
}

export async function addColorVariants(genericId: string, color: string): Promise<number> {
  const generic = await prisma.extractionResultFlat.findUnique({ where: { id: genericId } });
  if (!generic) return 0;

  if (!generic.majorCategory) throw new Error('No Major Category found on this article — cannot create variants.');
  const sizes = getSizesForMajCat(generic.majorCategory);
  if (sizes.length === 0) throw new Error(`No sizes are defined for Major Category "${generic.majorCategory}" in the active size mapping. Please update the active-size-mapping.xlsx file.`);

  const originalJob = await prisma.extractionJob.findUnique({
    where: { id: generic.jobId },
    select: { categoryId: true, userId: true, aiModel: true }
  });
  if (!originalJob) return 0;

  const {
    id: _id, jobId: _jobId, imageUncPath: _unc, createdAt: _ca, updatedAt: _ua,
    approvalStatus: _as, approvedBy: _ab, approvedAt: _aat,
    sapSyncStatus: _sss, sapArticleId: _sai, sapSyncMessage: _ssm,
    isGeneric: _ig, genericArticleId: _gai, variantSize: _vs, variantColor: _vc,
    ...rest
  } = generic;

  let created = 0;
  for (const size of sizes) {
    try {
      const newJob = await prisma.extractionJob.create({
        data: {
          userId: originalJob.userId,
          categoryId: originalJob.categoryId,
          imageUrl: generic.imageUrl || '',
          status: 'COMPLETED',
          aiModel: originalJob.aiModel,
          processingTimeMs: generic.processingTimeMs,
          tokensUsed: generic.totalTokens,
          inputTokens: generic.inputTokens,
          outputTokens: generic.outputTokens,
          apiCost: generic.apiCost,
          totalAttributes: generic.totalAttributes,
          extractedCount: generic.extractedCount,
          avgConfidence: generic.avgConfidence,
          completedAt: new Date(),
          designNumber: generic.articleNumber,
        }
      });
      const colorVariantId = randomUUID();
      const colorVariantData = {
        ...rest,
        id: colorVariantId,
        jobId: newJob.id,
        imageUncPath: null,
        approvalStatus: 'PENDING' as const,
        approvedBy: null,
        approvedAt: null,
        sapSyncStatus: 'NOT_SYNCED' as const,
        sapArticleId: null,
        sapSyncMessage: null,
        isGeneric: false,
        genericArticleId: genericId,
        variantSize: size,
        size: size,
        variantColor: color,
        colour: color,
      };
      await prisma.extractionResultFlat.create({ data: colorVariantData });

      // Mirror to 360article (fire-and-forget)
      void upsert360ArticleFlatRow(colorVariantId, colorVariantData as Record<string, unknown>);

      created++;
    } catch (err: any) {
      console.error(`[VariantCreation] addColor failed for size=${size}:`, err?.message);
    }
  }
  return created;
}

export async function syncGenericToVariants(genericId: string, updatedData: Record<string, any>): Promise<void> {
  try {
    // Remove variant-specific fields from sync payload
    const syncData: Record<string, any> = {};
    for (const [key, val] of Object.entries(updatedData)) {
      if (!VARIANT_ONLY_FIELDS.includes(key)) {
        syncData[key] = val;
      }
    }

    // Special case: sync colour from generic to variants that have no variantColor set yet
    // (variants with explicit variantColor keep their own colour)
    if (updatedData.colour !== undefined) {
      await prisma.extractionResultFlat.updateMany({
        where: { genericArticleId: genericId, isGeneric: false, variantColor: null },
        data: { colour: updatedData.colour, variantColor: updatedData.colour }
      });
    }

    if (Object.keys(syncData).length === 0) return;

    const variantIds = await prisma.extractionResultFlat.findMany({
      where: { genericArticleId: genericId, isGeneric: false },
      select: { id: true }
    });

    await prisma.extractionResultFlat.updateMany({
      where: { genericArticleId: genericId, isGeneric: false },
      data: syncData
    });

    // Mirror sync to 360article (fire-and-forget)
    void Promise.all(variantIds.map(v => mirror360FlatUpdate(v.id, syncData)));

    console.log(`[VariantSync] Synced ${Object.keys(syncData).length} fields to variants of generic=${genericId}`);
  } catch (err: any) {
    // Log but do not rethrow — variant sync failure must not crash the main update request
    console.error(`[VariantSync] Failed to sync variants for generic=${genericId}:`, err?.message ?? err);
  }
}
