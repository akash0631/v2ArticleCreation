import { Request, Response } from 'express';
import { ApprovalStatus, SapSyncStatus } from '../generated/prisma';
import { getHsnCodeByMcCode, getMcCodeByMajorCategory } from '../utils/mcCodeMapper';
import { parseNumericValue } from '../utils/mrpCalculator';
import { getSegmentByCategoryAndMrp } from '../utils/segmentRangeMapper';
import { syncApprovedItemsToSap } from '../services/sapSyncService';
import { storageService } from '../services/storageService';
import { ARTICLE_DESCRIPTION_SOURCE_FIELDS, buildArticleDescription } from '../utils/articleDescriptionBuilder';
import { prismaClient as prisma } from '../utils/prisma';
import { syncGenericToVariants, addColorVariants } from '../services/variantCreationService';
import { hasVendorCode, isValidVendorCode, normalizeVendorCode } from '../utils/vendorCode';

export class ApproverController {
    private static readonly STARTUP_BACKFILL_BATCH_SIZE = parseInt(process.env.STARTUP_BACKFILL_BATCH_SIZE || '250', 10);
    private static readonly STARTUP_BACKFILL_DELAY_MS = parseInt(process.env.STARTUP_BACKFILL_DELAY_MS || '15000', 10);
    private static readonly STARTUP_BACKFILLS_ENABLED = String(process.env.STARTUP_BACKFILLS_ENABLED ?? 'true').toLowerCase() !== 'false';
    private static readonly STARTUP_BACKFILLS_IN_DEV = String(process.env.STARTUP_BACKFILLS_IN_DEV ?? 'false').toLowerCase() === 'true';
    private static readonly APPROVER_ATTRIBUTES_CACHE_TTL_MS = parseInt(process.env.APPROVER_ATTRIBUTES_CACHE_TTL_MS || '300000', 10);
    private static readonly NUMERIC_OLD_ARTICLES_CACHE_TTL_MS = parseInt(process.env.NUMERIC_OLD_ARTICLES_CACHE_TTL_MS || '30000', 10);
    private static startupBackfillRunning = false;
    private static attributesCache: { data: any[]; expiresAt: number } | null = null;
    private static pendingAttributesLoad: Promise<any[]> | null = null;
    private static numericOldArticleIdsCache: { ids: string[]; expiresAt: number } | null = null;
    private static pendingNumericOldArticleIdsLoad: Promise<string[]> | null = null;

    private static extractNumericWeight(value: unknown): string | null {
        if (value === null || value === undefined) return null;
        const text = String(value).trim();
        if (!text) return null;
        const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
        return match ? match[1] : null;
    }

    private static readonly SEGMENT_RANGE_ERROR = 'MRP is outside the allowed segment ranges for this category.';

    private static normalizeText(value?: string | null): string {
        return String(value || '').trim().toUpperCase();
    }

    private static getDivisionVariants(value?: string | null): string[] {
        const normalized = ApproverController.normalizeText(value);
        if (!normalized) return [];

        if (normalized === 'MEN' || normalized === 'MENS') return ['MEN', 'MENS'];
        if (normalized === 'LADIES' || normalized === 'WOMEN' || normalized === 'WOMAN') return ['LADIES', 'WOMEN'];
        if (normalized === 'KID' || normalized === 'KIDS') return ['KID', 'KIDS'];

        return [normalized];
    }

    private static getSubDivisionVariants(value?: string | null): string[] {
        if (!value) return [];

        const tokens = String(value)
            .split(/[;,|]+/)
            .map((item) => ApproverController.normalizeText(item))
            .filter(Boolean);

        return Array.from(new Set(tokens));
    }

    private static getCurrentYearString(): string {
        return String(new Date().getFullYear());
    }

    private static getCurrentSeasonConfig(now: Date = new Date()): { seasonName: string; seasonCode: string; yearFull: string; yearShort: string } {
        const month = now.getMonth() + 1; // 1-12
        const yearFull = String(now.getFullYear());
        const yearShort = yearFull.slice(-2);

        if (month >= 1 && month <= 3) {
            return {
                seasonName: 'SPRING-SUMMER',
                seasonCode: `SP${yearShort}`,
                yearFull,
                yearShort
            };
        }

        if (month >= 4 && month <= 6) {
            return {
                seasonName: 'SUMMER',
                seasonCode: `S${yearShort}`,
                yearFull,
                yearShort
            };
        }

        if (month >= 7 && month <= 9) {
            return {
                seasonName: 'AUTUMN',
                seasonCode: `A${yearShort}`,
                yearFull,
                yearShort
            };
        }

        return {
            seasonName: 'WINTER',
            seasonCode: `W${yearShort}`,
            yearFull,
            yearShort
        };
    }

    private static applyApproverScope(where: any, user?: Express.Request['user']) {
        const role = String(user?.role || '');

        const addDivisionScope = (divisionValue?: string | null) => {
            const variants = ApproverController.getDivisionVariants(divisionValue);
            if (variants.length === 0) return;

            if (variants.length === 1) {
                where.division = { equals: variants[0], mode: 'insensitive' };
                return;
            }

            where.AND = where.AND || [];
            where.AND.push({
                OR: variants.map((variant) => ({
                    division: { equals: variant, mode: 'insensitive' }
                }))
            });
        };

        const addSubDivisionScope = (subDivisionValue?: string | null) => {
            const variants = ApproverController.getSubDivisionVariants(subDivisionValue);
            if (variants.length === 0) return;

            // Include articles with matching subDivision OR with null/empty subDivision
            // (articles extracted without category assignment should still be visible)
            where.AND = where.AND || [];
            where.AND.push({
                OR: [
                    ...variants.map((variant) => ({
                        subDivision: { equals: variant, mode: 'insensitive' }
                    })),
                    { subDivision: null },
                    { subDivision: '' }
                ]
            });
        };

        if (role === 'APPROVER') {
            addDivisionScope(user?.division);
            addSubDivisionScope(user?.subDivision);
            return;
        }

        if (role === 'CATEGORY_HEAD') {
            addDivisionScope(user?.division);
            return;
        }
    }

    private static async backfillMissingMcCodes(baseWhere: any): Promise<number> {
        const missingRows = await prisma.extractionResultFlat.findMany({
            where: {
                ...baseWhere,
                mcCode: null,
                majorCategory: { not: null }
            },
            select: {
                id: true,
                majorCategory: true
            },
            take: ApproverController.STARTUP_BACKFILL_BATCH_SIZE
        });

        if (missingRows.length === 0) return 0;

        const idsByCode = new Map<string, string[]>();

        for (const row of missingRows) {
            const code = getMcCodeByMajorCategory(row.majorCategory);
            if (!code) continue;

            const ids = idsByCode.get(code) || [];
            ids.push(row.id);
            idsByCode.set(code, ids);
        }

        if (idsByCode.size === 0) return 0;

        const updates = Array.from(idsByCode.entries()).map(([mcCode, ids]) =>
            prisma.extractionResultFlat.updateMany({
                where: { id: { in: ids } },
                data: {
                    mcCode,
                    hsnTaxCode: getHsnCodeByMcCode(mcCode)
                }
            })
        );

        let total = 0;
        for (const update of updates) {
            const result = await update;
            total += result.count;
        }
        return total;
    }

    private static async backfillMissingHsnCodes(baseWhere: any): Promise<number> {
        const rows = await prisma.extractionResultFlat.findMany({
            where: {
                ...baseWhere,
                mcCode: { not: null },
                hsnTaxCode: null
            },
            select: {
                id: true,
                mcCode: true
            },
            take: ApproverController.STARTUP_BACKFILL_BATCH_SIZE
        });

        if (rows.length === 0) return 0;

        const idsByHsn = new Map<string, string[]>();

        for (const row of rows) {
            const mappedHsn = getHsnCodeByMcCode(row.mcCode);
            if (!mappedHsn) continue;

            const ids = idsByHsn.get(mappedHsn) || [];
            ids.push(row.id);
            idsByHsn.set(mappedHsn, ids);
        }

        if (idsByHsn.size === 0) return 0;

        const updates = Array.from(idsByHsn.entries()).map(([hsnTaxCode, ids]) =>
            prisma.extractionResultFlat.updateMany({
                where: { id: { in: ids } },
                data: { hsnTaxCode }
            })
        );

        let total = 0;
        for (const update of updates) {
            const result = await update;
            total += result.count;
        }
        return total;
    }

    private static async backfillMissingSegments(baseWhere: any): Promise<number> {
        const rows = await prisma.extractionResultFlat.findMany({
            where: {
                ...baseWhere,
                segment: null,
                majorCategory: { not: null },
                mrp: { not: null }
            },
            select: {
                id: true,
                majorCategory: true,
                mrp: true
            },
            take: ApproverController.STARTUP_BACKFILL_BATCH_SIZE
        });

        if (rows.length === 0) return 0;

        const idsBySegment = new Map<string, string[]>();

        for (const row of rows) {
            const segment = getSegmentByCategoryAndMrp(row.majorCategory, row.mrp);
            if (!segment) continue;

            const ids = idsBySegment.get(segment) || [];
            ids.push(row.id);
            idsBySegment.set(segment, ids);
        }

        if (idsBySegment.size === 0) return 0;

        const updates = Array.from(idsBySegment.entries()).map(([segment, ids]) =>
            prisma.extractionResultFlat.updateMany({
                where: { id: { in: ids } },
                data: { segment }
            })
        );

        let total = 0;
        for (const update of updates) {
            const result = await update;
            total += result.count;
        }
        return total;
    }

    private static async backfillMissingYears(baseWhere: any): Promise<number> {
        const currentYear = ApproverController.getCurrentYearString();
        const result = await prisma.extractionResultFlat.updateMany({
            where: {
                ...baseWhere,
                OR: [
                    { year: null },
                    { year: '' }
                ]
            },
            data: {
                year: currentYear
            }
        });

        return result.count;
    }

    private static async backfillMissingSeasonCodes(baseWhere: any): Promise<number> {
        const { seasonCode } = ApproverController.getCurrentSeasonConfig();
        const result = await prisma.extractionResultFlat.updateMany({
            where: {
                ...baseWhere,
                OR: [
                    { season: null },
                    { season: '' }
                ]
            },
            data: {
                season: seasonCode
            }
        });

        return result.count;
    }

    private static async refreshArticleDescriptions(baseWhere: any): Promise<number> {
        const rows = await prisma.extractionResultFlat.findMany({
            where: {
                ...baseWhere
            },
            select: {
                id: true,
                articleDescription: true,
                // All fields used by buildArticleDescription
                yarn1: true,
                weave: true,
                mFab2: true,
                fabricMainMvgr: true,
                lycra: true,
                neck: true,
                sleeve: true,
                fatherBelt: true,
                fit: true,
                pattern: true,
                length: true,
                printType: true,
                printPlacement: true,
                printStyle: true,
                embroidery: true,
                pocketType: true,
                vendorCode: true,
                designNumber: true,
                size: true,
                // Extra fields fetched but not part of description formula
                yarn2: true,
                composition: true,
                finish: true,
                gsm: true,
                shade: true,
                neckDetails: true,
                collar: true,
                placket: true,
                bottomFold: true,
                frontOpenStyle: true,
                drawcord: true,
                button: true,
                zipper: true,
                zipColour: true,
                patches: true,
                patchesType: true,
                embroideryType: true,
                wash: true,
                childBelt: true
            },
            take: ApproverController.STARTUP_BACKFILL_BATCH_SIZE
        });

        if (rows.length === 0) return 0;

        const idsByDescription = new Map<string, string[]>();
        const idsToNull: string[] = [];

        for (const row of rows) {
            const computedDescription = buildArticleDescription(row as any);
            const currentDescription = row.articleDescription ? String(row.articleDescription).trim() : null;

            if ((computedDescription || null) === (currentDescription || null)) {
                continue;
            }

            if (!computedDescription) {
                idsToNull.push(row.id);
                continue;
            }

            const ids = idsByDescription.get(computedDescription) || [];
            ids.push(row.id);
            idsByDescription.set(computedDescription, ids);
        }

        const updates = Array.from(idsByDescription.entries()).map(([articleDescription, ids]) =>
            prisma.extractionResultFlat.updateMany({
                where: { id: { in: ids } },
                data: { articleDescription }
            })
        );

        if (idsToNull.length > 0) {
            updates.push(
                prisma.extractionResultFlat.updateMany({
                    where: { id: { in: idsToNull } },
                    data: { articleDescription: null }
                })
            );
        }

        if (updates.length === 0) return 0;

        let total = 0;
        for (const update of updates) {
            const result = await update;
            total += result.count;
        }
        return total;
    }

    // Admin endpoint: backfill article descriptions for a date range.
    static async backfillDescriptions(req: Request, res: Response) {
        try {
            // Default: April 10 2026 → now
            const fromDate = req.query.fromDate
                ? new Date(req.query.fromDate as string)
                : new Date('2026-04-10T00:00:00.000Z');
            const toDate = req.query.toDate
                ? new Date(req.query.toDate as string)
                : new Date();

            if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
                return res.status(400).json({ error: 'Invalid fromDate or toDate' });
            }

            console.log(`[Backfill] Article descriptions from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

            const where = {
                createdAt: {
                    gte: fromDate,
                    lte: toDate,
                }
            };

            const updated = await ApproverController.refreshArticleDescriptions(where);
            return res.json({ success: true, updated, fromDate, toDate });
        } catch (err: any) {
            console.error('[Backfill] Error:', err);
            return res.status(500).json({ error: err?.message || 'Backfill failed' });
        }
    }

    // Backfill variantColor (and colour) for existing size variants that are missing them.
    // Looks up each variant's generic article and copies its colour.
    private static async backfillVariantColors(): Promise<number> {
        // Find all non-generic variants that are missing variantColor OR colour
        const variants = await prisma.extractionResultFlat.findMany({
            where: {
                isGeneric: false,
                genericArticleId: { not: null },
                OR: [
                    { variantColor: null },
                    { colour: null }
                ]
            },
            select: { id: true, colour: true, variantColor: true, genericArticleId: true }
        });

        if (variants.length === 0) return 0;

        // Group by genericArticleId to batch generic lookups
        const genericIds = [...new Set(variants.map(v => v.genericArticleId!))];
        const generics = await prisma.extractionResultFlat.findMany({
            where: { id: { in: genericIds } },
            select: { id: true, colour: true }
        });
        const genericColourMap = new Map(generics.map(g => [g.id, g.colour]));

        let count = 0;
        for (const v of variants) {
            const colour = v.colour || genericColourMap.get(v.genericArticleId!) || null;
            if (!colour) continue; // skip if neither variant nor generic has colour
            await prisma.extractionResultFlat.update({
                where: { id: v.id },
                data: { variantColor: colour, colour }
            });
            count++;
        }
        console.log(`[Backfill] Fixed variantColor for ${count} variant rows`);
        return count;
    }

    // Run once at server startup to backfill missing computed fields across all records.
    static runStartupBackfills(): void {
        if (!ApproverController.STARTUP_BACKFILLS_ENABLED) {
            console.log('[Backfill] Startup backfills disabled by STARTUP_BACKFILLS_ENABLED=false');
            return;
        }

        if (process.env.NODE_ENV === 'development' && !ApproverController.STARTUP_BACKFILLS_IN_DEV) {
            console.log('[Backfill] Skipping startup backfills in development. Set STARTUP_BACKFILLS_IN_DEV=true to enable.');
            return;
        }

        if (ApproverController.startupBackfillRunning) {
            return;
        }

        ApproverController.startupBackfillRunning = true;

        const run = async () => {
            try {
                await ApproverController.backfillMissingMcCodes({});
                await ApproverController.backfillMissingHsnCodes({});
                await ApproverController.backfillMissingSegments({});
                await ApproverController.backfillMissingYears({});
                await ApproverController.backfillMissingSeasonCodes({});
                await ApproverController.refreshArticleDescriptions({});
                await ApproverController.backfillVariantColors();
                console.log('✅ Startup backfills completed');
            } catch (err: any) {
                console.warn('⚠️ Startup backfills failed (non-critical):', err?.message);
            } finally {
                ApproverController.startupBackfillRunning = false;
            }
        };
        // Delay startup backfills so the first page load is not competing for DB sessions.
        setTimeout(() => { void run(); }, ApproverController.STARTUP_BACKFILL_DELAY_MS);
    }

    // Get items for approver dashboard
    // Filters: approvalStatus (default: PENDING), division, date range, search
    // Unique folder-name markers that identify "OLD ARTICLES" paths.
    // Using contains (no backslashes) instead of startsWith to avoid PostgreSQL LIKE escape issues.
    private static readonly OLD_PATH_MARKERS = [
        'PIC-LADIES-LESS THAN 180',
        'PIC-KIDS-LESS THAN 180',
        'PIC-MENS-LESS THAN 180',
    ];

    /**
     * Returns IDs of articles whose articleNumber OR imageName is a 10-digit numeric string
     * (e.g. "1130153330" or "1130153330.jpg"). These are treated as OLD articles regardless
     * of their imageUncPath, because they already have a pre-existing SAP article number.
     */
    private static async getNumericOldArticleIds(): Promise<string[]> {
        const cached = ApproverController.numericOldArticleIdsCache;
        if (cached && cached.expiresAt > Date.now()) {
            return cached.ids;
        }

        if (ApproverController.pendingNumericOldArticleIdsLoad) {
            return ApproverController.pendingNumericOldArticleIdsLoad;
        }

        // Only PENDING articles with 10-digit numeric names are routed to Old Articles.
        // Approved articles stay out (they're done), rejected ones go to the Rejected page.
        const loadPromise = prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM extraction_results_flat
            WHERE (article_number ~ '^[0-9]{10}$'
               OR image_name ~ '^[0-9]{10}(\.[a-zA-Z0-9]+)?$')
              AND approval_status = 'PENDING'
        `.then((rows) => {
            const ids = rows.map(r => r.id);
            ApproverController.numericOldArticleIdsCache = {
                ids,
                expiresAt: Date.now() + ApproverController.NUMERIC_OLD_ARTICLES_CACHE_TTL_MS
            };
            return ids;
        }).finally(() => {
            ApproverController.pendingNumericOldArticleIdsLoad = null;
        });

        ApproverController.pendingNumericOldArticleIdsLoad = loadPromise;
        return loadPromise;
    }

    static async getItems(req: Request, res: Response) {
        try {
            const { status, division, subDivision, startDate, endDate, search, page = 1, limit = 50, pathType } = req.query;

            const where: any = {};

            // RBAC: Enforce scope by role
            const role = String(req.user?.role || '');
            if (role === 'ADMIN') {
                // Admins can filter freely
                if (division && division !== 'ALL') where.division = division as string;
                if (subDivision && subDivision !== 'ALL') where.subDivision = subDivision as string;
            } else {
                ApproverController.applyApproverScope(where, req.user);
            }

            // Path-type filter: 'old' → only OLD_PATH_MARKERS or 10-digit numeric article/image names,
            // 'new' → exclude both, 'rejected' → only REJECTED status.
            // Using `contains` (no backslashes) avoids PostgreSQL LIKE escape-character issues
            // that occur when using `startsWith` with UNC paths (\\server\folder...).
            console.log(`[ApproverController] pathType=${pathType ?? 'none'}`);
            if (pathType === 'old' || pathType === 'new') {
                // Fetch IDs of articles with 10-digit numeric article/image names — these are always "old".
                const numericOldIds = await ApproverController.getNumericOldArticleIds();

                if (pathType === 'old') {
                    where.AND = where.AND || [];
                    // OLD = path matches OLD_PATH_MARKERS OR has a 10-digit numeric article/image name.
                    const oldConditions: any[] = ApproverController.OLD_PATH_MARKERS.map(marker => ({
                        imageUncPath: { contains: marker, mode: 'insensitive' }
                    }));
                    if (numericOldIds.length > 0) {
                        oldConditions.push({ id: { in: numericOldIds } });
                    }
                    where.AND.push({ OR: oldConditions });
                } else {
                    where.AND = where.AND || [];
                    // NEW = not an OLD_PATH_MARKER path AND not a numeric old article.
                    // Also include records where imageUncPath is NULL (manual uploads) unless they are numeric old.
                    const notOldPath = {
                        OR: [
                            { imageUncPath: null },
                            {
                                AND: ApproverController.OLD_PATH_MARKERS.map(marker => ({
                                    NOT: { imageUncPath: { contains: marker, mode: 'insensitive' } }
                                }))
                            }
                        ]
                    };
                    where.AND.push(notOldPath);
                    if (numericOldIds.length > 0) {
                        where.AND.push({ NOT: { id: { in: numericOldIds } } });
                    }
                    // Exclude REJECTED articles from the new articles view — they have their own dedicated page.
                    where.AND.push({
                        NOT: { approvalStatus: ApprovalStatus.REJECTED }
                    });
                }
            } else if (pathType === 'rejected') {
                // Dedicated rejected articles view — always filter to REJECTED only.
                where.AND = where.AND || [];
                where.AND.push({ approvalStatus: ApprovalStatus.REJECTED });
            }

            // Status Filtering (Multi-select support)
            // Supports virtual FAILED status mapped from sapSyncStatus=FAILED.
            // Skip status filter when pathType forces a specific status (rejected view).
            if (status && status !== 'ALL' && pathType !== 'rejected') {
                const requestedStatuses = (status as string)
                    .split(',')
                    .map(s => String(s || '').trim().toUpperCase())
                    .filter(Boolean);

                const approvalStatuses = requestedStatuses.filter((s) =>
                    s === ApprovalStatus.PENDING ||
                    s === ApprovalStatus.APPROVED ||
                    s === ApprovalStatus.REJECTED
                ) as ApprovalStatus[];

                const includeFailed = requestedStatuses.includes('FAILED');

                if (approvalStatuses.length > 0 || includeFailed) {
                    const statusPredicates: any[] = [];

                    if (approvalStatuses.length > 0) {
                        statusPredicates.push({ approvalStatus: { in: approvalStatuses } });
                    }

                    if (includeFailed) {
                        statusPredicates.push({ sapSyncStatus: SapSyncStatus.FAILED });
                    }

                    where.AND = where.AND || [];
                    where.AND.push(
                        statusPredicates.length === 1
                            ? statusPredicates[0]
                            : { OR: statusPredicates }
                    );
                }
            }

            // Date Range Filtering
            if (startDate && endDate) {
                where.createdAt = {
                    gte: new Date(startDate as string),
                    lte: new Date(endDate as string)
                };
            }

            // Text Search
            if (search) {
                const searchTerm = search as string;
                where.OR = [
                    { articleNumber: { contains: searchTerm, mode: 'insensitive' } },
                    { designNumber: { contains: searchTerm, mode: 'insensitive' } },
                    { vendorName: { contains: searchTerm, mode: 'insensitive' } },
                    { pptNumber: { contains: searchTerm, mode: 'insensitive' } },
                    { referenceArticleNumber: { contains: searchTerm, mode: 'insensitive' } }
                ];
            }

            // Only show generic articles in the main list (variants are fetched via /items/:id/variants)
            where.isGeneric = true;

            const skip = (Number(page) - 1) * Number(limit);

            const [items, total] = await prisma.$transaction([
              prisma.extractionResultFlat.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    imageName: true,
                    imageUrl: true,
                    imageUncPath: true,
                    articleNumber: true,
                    division: true,
                    subDivision: true,
                    majorCategory: true,
                    vendorName: true,
                    vendorCode: true,
                    designNumber: true,
                    pptNumber: true,
                    referenceArticleNumber: true,
                    referenceArticleDescription: true,
                    approvalStatus: true,
                    sapSyncStatus: true,
                    sapSyncMessage: true,
                    sapArticleId: true,
                    createdAt: true,
                    updatedAt: true,
                    userName: true,
                    source: true,
                    rate: true,
                    mrp: true,
                    size: true,
                    colour: true,
                    fabricMainMvgr: true,
                    pattern: true,
                    fit: true,
                    neck: true,
                    neckDetails: true,
                    sleeve: true,
                    length: true,
                    collar: true,
                    placket: true,
                    bottomFold: true,
                    frontOpenStyle: true,
                    pocketType: true,
                    composition: true,
                    gsm: true,
                    weight: true,
                    finish: true,
                    shade: true,
                    lycra: true,
                    yarn1: true,
                    yarn2: true,
                    weave: true,
                    macroMvgr: true,
                    mainMvgr: true,
                    mFab2: true,
                    wash: true,
                    drawcord: true,
                    button: true,
                    zipper: true,
                    zipColour: true,
                    fatherBelt: true,
                    childBelt: true,
                    printType: true,
                    printStyle: true,
                    printPlacement: true,
                    patches: true,
                    patchesType: true,
                    embroidery: true,
                    embroideryType: true,
                    mcCode: true,
                    segment: true,
                    season: true,
                    hsnTaxCode: true,
                    articleDescription: true,
                    fashionGrid: true,
                    year: true,
                    articleType: true,
                    isGeneric: true,
                    genericArticleId: true,
                    variantSize: true,
                    variantColor: true,
                }
              }),
              prisma.extractionResultFlat.count({ where }),
            ]);

            return res.json({
                data: items,
                meta: {
                    total,
                    page: Number(page),
                    div: Number(limit), // limit
                    totalPages: Math.ceil(total / Number(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching approver items:', error);
            return res.status(500).json({ error: 'Failed to fetch items' });
        }
    }

    // Export ALL items matching current filters (no pagination) — used for bulk Excel download
    static async exportAll(req: Request, res: Response) {
        try {
            const { status, division, subDivision, startDate, endDate, search, pathType } = req.query;

            const where: any = {};

            // RBAC
            const role = String(req.user?.role || '');
            if (role === 'ADMIN') {
                if (division && division !== 'ALL') where.division = division as string;
                if (subDivision && subDivision !== 'ALL') where.subDivision = subDivision as string;
            } else {
                ApproverController.applyApproverScope(where, req.user);
            }

            // Path-type filter (same logic as getItems — old includes numeric old article IDs too)
            console.log(`[ApproverController] exportAll pathType=${pathType ?? 'none'}`);
            if (pathType === 'old' || pathType === 'new') {
                const numericOldIds = await ApproverController.getNumericOldArticleIds();

                if (pathType === 'old') {
                    where.AND = where.AND || [];
                    const oldConditions: any[] = ApproverController.OLD_PATH_MARKERS.map(marker => ({
                        imageUncPath: { contains: marker, mode: 'insensitive' }
                    }));
                    if (numericOldIds.length > 0) {
                        oldConditions.push({ id: { in: numericOldIds } });
                    }
                    where.AND.push({ OR: oldConditions });
                } else {
                    where.AND = where.AND || [];
                    where.AND.push({
                        OR: [
                            { imageUncPath: null },
                            {
                                AND: ApproverController.OLD_PATH_MARKERS.map(marker => ({
                                    NOT: { imageUncPath: { contains: marker, mode: 'insensitive' } }
                                }))
                            }
                        ]
                    });
                    if (numericOldIds.length > 0) {
                        where.AND.push({ NOT: { id: { in: numericOldIds } } });
                    }
                }
            }

            // Status filter
            if (status && status !== 'ALL') {
                const requestedStatuses = (status as string)
                    .split(',')
                    .map(s => String(s || '').trim().toUpperCase())
                    .filter(Boolean);

                const approvalStatuses = requestedStatuses.filter((s) =>
                    s === ApprovalStatus.PENDING ||
                    s === ApprovalStatus.APPROVED ||
                    s === ApprovalStatus.REJECTED
                ) as ApprovalStatus[];

                const includeFailed = requestedStatuses.includes('FAILED');

                if (approvalStatuses.length > 0 || includeFailed) {
                    const statusPredicates: any[] = [];
                    if (approvalStatuses.length > 0) {
                        statusPredicates.push({ approvalStatus: { in: approvalStatuses } });
                    }
                    if (includeFailed) {
                        statusPredicates.push({ sapSyncStatus: SapSyncStatus.FAILED });
                    }
                    where.AND = where.AND || [];
                    where.AND.push(
                        statusPredicates.length === 1
                            ? statusPredicates[0]
                            : { OR: statusPredicates }
                    );
                }
            }

            // Date range
            if (startDate && endDate) {
                where.createdAt = {
                    gte: new Date(startDate as string),
                    lte: new Date(endDate as string)
                };
            }

            // Text search
            if (search) {
                const searchTerm = search as string;
                where.OR = [
                    { articleNumber: { contains: searchTerm, mode: 'insensitive' } },
                    { designNumber: { contains: searchTerm, mode: 'insensitive' } },
                    { vendorName: { contains: searchTerm, mode: 'insensitive' } },
                    { pptNumber: { contains: searchTerm, mode: 'insensitive' } },
                    { referenceArticleNumber: { contains: searchTerm, mode: 'insensitive' } }
                ];
            }

            // Fetch ALL matching rows (no skip/take) ordered by createdAt desc
            const items = await prisma.extractionResultFlat.findMany({
                where,
                orderBy: { createdAt: 'desc' },
            });

            console.log(`[ApproverController] exportAll returning ${items.length} rows`);

            return res.json({ data: items, meta: { total: items.length } });
        } catch (error) {
            console.error('Error in exportAll:', error);
            return res.status(500).json({ error: 'Failed to export items' });
        }
    }

    // Get master attributes for dropdowns
    static async getAttributes(req: Request, res: Response) {
        try {
            const cached = ApproverController.attributesCache;
            let attributes = cached && cached.expiresAt > Date.now() ? cached.data : null;

            if (!attributes) {
                if (!ApproverController.pendingAttributesLoad) {
                    ApproverController.pendingAttributesLoad = prisma.masterAttribute.findMany({
                        where: { isActive: true },
                        include: {
                            allowedValues: {
                                where: { isActive: true },
                                orderBy: { displayOrder: 'asc' }
                            }
                        },
                        orderBy: { displayOrder: 'asc' }
                    }).then((rows) => {
                        ApproverController.attributesCache = {
                            data: rows,
                            expiresAt: Date.now() + ApproverController.APPROVER_ATTRIBUTES_CACHE_TTL_MS
                        };
                        return rows;
                    }).finally(() => {
                        ApproverController.pendingAttributesLoad = null;
                    });
                }

                attributes = await ApproverController.pendingAttributesLoad;
            }

            return res.json(attributes);
        } catch (error) {
            console.error('Error fetching attributes:', error);
            return res.status(500).json({ error: 'Failed to fetch attributes' });
        }
    }

    // Update item details (Edit)
    static async updateItem(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const rawData = req.body;

            // Whitelist allowed fields to prevent overwriting metadata
            // and sanitize types
            const allowedFields = [
                'articleNumber', 'division', 'subDivision', 'majorCategory', 'vendorName', 'designNumber',
                'pptNumber', 'rate', 'size', 'yarn1', 'yarn2', 'fabricMainMvgr', 'weave',
                'composition', 'finish', 'gsm', 'shade', 'weight', 'lycra', 'neck', 'neckDetails',
                'collar', 'placket', 'sleeve', 'bottomFold', 'frontOpenStyle', 'pocketType',
                'fit', 'pattern', 'length', 'colour', 'drawcord', 'button', 'zipper',
                'zipColour', 'printType', 'printStyle', 'printPlacement', 'patches',
                'patchesType', 'embroidery', 'embroideryType', 'wash', 'fatherBelt', 'childBelt',
                'referenceArticleNumber', 'referenceArticleDescription',
                // New business fields
                'macroMvgr', 'mainMvgr', 'mFab2',
                'vendorCode', 'mrp', 'mcCode', 'segment', 'season',
                'hsnTaxCode', 'articleDescription', 'fashionGrid', 'year', 'articleType',
                // Variant-specific fields
                'variantColor', 'variantSize'
            ];

            const data: any = {};

            for (const field of allowedFields) {
                if (rawData[field] !== undefined) {
                    let value = rawData[field];

                    // Handle numeric/decimal fields (rate, mrp)
                    if (field === 'rate' || field === 'mrp') {
                        if (value === '' || value === null || value === undefined) {
                            value = null;
                        } else {
                            value = parseNumericValue(value);
                        }
                    } else if (field === 'weight') {
                        value = ApproverController.extractNumericWeight(value);
                    } else if (value === '') {
                        // Convert empty strings to null for optional text fields
                        // Actually extractionResultFlat fields are mostly nullable strings, so '' might be okay or null preference.
                        // Let's stick to null for empty strings to be cleaner
                        value = null;
                    }

                    if (field === 'vendorCode') {
                        if (!hasVendorCode(value)) {
                            return res.status(400).json({
                                error: 'Vendor Code is required and must be exactly 6 digits.'
                            });
                        }
                        if (!isValidVendorCode(value)) {
                            return res.status(400).json({
                                error: 'Vendor Code is required and must be exactly 6 digits.'
                            });
                        }
                        value = normalizeVendorCode(value);
                    }

                    data[field] = value;
                }
            }

            // Enforce mc code list major categories only (mc des)
            if (data.majorCategory !== undefined && data.majorCategory !== null) {
                const majorCategoryText = String(data.majorCategory).trim();
                if (majorCategoryText) {
                    const mapped = getMcCodeByMajorCategory(majorCategoryText);
                    if (!mapped) {
                        return res.status(400).json({
                            error: `Invalid majorCategory '${majorCategoryText}'. Please use values from mc code list (mc des).`
                        });
                    }
                }
            }

            // Strict rule:
            // mcCode should exist only when exact majorCategory mapping exists.
            // Otherwise keep mcCode blank.
            if (data.majorCategory !== undefined) {
                data.mcCode = getMcCodeByMajorCategory(data.majorCategory) || null;
                data.hsnTaxCode = getHsnCodeByMcCode(data.mcCode) || null;
            } else if (data.mcCode !== undefined) {
                data.hsnTaxCode = getHsnCodeByMcCode(data.mcCode) || null;
            }

            // RBAC: Check access for Approvers & Validate Status
            const existingItem = await prisma.extractionResultFlat.findUnique({
                where: { id },
                select: {
                    id: true,
                    approvalStatus: true,
                    rate: true,
                    division: true,
                    subDivision: true,
                    majorCategory: true,
                    mrp: true,
                    yarn1: true,
                    yarn2: true,
                    fabricMainMvgr: true,
                    weave: true,
                    composition: true,
                    finish: true,
                    gsm: true,
                    shade: true,
                    weight: true,
                    lycra: true,
                    neck: true,
                    neckDetails: true,
                    collar: true,
                    placket: true,
                    sleeve: true,
                    bottomFold: true,
                    frontOpenStyle: true,
                    pocketType: true,
                    fit: true,
                    pattern: true,
                    length: true,
                    drawcord: true,
                    button: true,
                    zipper: true,
                    zipColour: true,
                    printType: true,
                    printStyle: true,
                    printPlacement: true,
                    patches: true,
                    patchesType: true,
                    embroidery: true,
                    embroideryType: true,
                    wash: true,
                    fatherBelt: true,
                    childBelt: true,
                    vendorCode: true,
                    season: true,
                    year: true,
                    isGeneric: true
                }
            });

            if (!existingItem) {
                return res.status(404).json({ error: 'Item not found' });
            }

            const finalVendorCode = data.vendorCode !== undefined
                ? data.vendorCode
                : (existingItem as any).vendorCode;

            if (!hasVendorCode(finalVendorCode) || !isValidVendorCode(finalVendorCode)) {
                return res.status(400).json({
                    error: 'Vendor Code is required and must be exactly 6 digits.'
                });
            }

            // Prevent updating approved items
            if (existingItem.approvalStatus === 'APPROVED') {
                return res.status(403).json({ error: 'Cannot update an approved item. It is locked for SAP sync.' });
            }

            const role = String(req.user?.role || '');
            if (role === 'APPROVER' || role === 'CATEGORY_HEAD') {
                const existingDivision = ApproverController.normalizeText(existingItem.division);
                const existingSubDivision = ApproverController.normalizeText(existingItem.subDivision);
                const userDivisionVariants = ApproverController.getDivisionVariants(req.user?.division);
                const userSubDivisionVariants = ApproverController.getSubDivisionVariants(req.user?.subDivision);

                if (userDivisionVariants.length > 0 && !userDivisionVariants.includes(existingDivision)) {
                    return res.status(403).json({ error: 'Access denied: Division mismatch' });
                }
                if (role === 'APPROVER' && userSubDivisionVariants.length > 0 && !userSubDivisionVariants.includes(existingSubDivision)) {
                    return res.status(403).json({ error: 'Access denied: Sub-Division mismatch' });
                }
            }

            const toComparableNumber = (value: unknown): number | null => {
                const parsed = parseNumericValue(value);
                return parsed === null ? null : Number(parsed.toFixed(2));
            };

            const incomingRate = data.rate !== undefined ? toComparableNumber(data.rate) : null;
            const existingRate = toComparableNumber(existingItem.rate);
            const rateActuallyChanged = data.rate !== undefined && incomingRate !== existingRate;

            // MRP is manually set by the user — no auto-derivation from rate.

            const finalMajorCategory = (data.majorCategory !== undefined ? data.majorCategory : existingItem.majorCategory) as string | null;
            const finalMrp = data.mrp !== undefined ? data.mrp : existingItem.mrp;

            // Recalculate segment whenever MRP or majorCategory changes.
            // MRP is manually editable, so never hard-block the save — just set segment to null if out of range.
            const mrpActuallyChanged = data.mrp !== undefined && toComparableNumber(data.mrp) !== toComparableNumber(existingItem.mrp);
            const categoryActuallyChanged = data.majorCategory !== undefined && data.majorCategory !== existingItem.majorCategory;
            if ((mrpActuallyChanged || categoryActuallyChanged) && finalMajorCategory && finalMrp !== null && finalMrp !== undefined) {
                const segment = getSegmentByCategoryAndMrp(finalMajorCategory, finalMrp);
                data.segment = segment ?? null;
            } else if (finalMajorCategory && finalMrp !== null && finalMrp !== undefined) {
                // Always try to set segment silently (no error if not found)
                const segment = getSegmentByCategoryAndMrp(finalMajorCategory, finalMrp);
                if (segment) data.segment = segment;
            }

            // Do not force-overwrite user-edited season/year on every save.
            // Only auto-fill defaults when BOTH are absent in payload and missing in DB.
            if (data.year === undefined && data.season === undefined) {
                const currentSeason = ApproverController.getCurrentSeasonConfig();
                if (!existingItem.year || String(existingItem.year).trim() === '') {
                    data.year = currentSeason.yearFull;
                }
                if (!existingItem.season || String(existingItem.season).trim() === '') {
                    data.season = currentSeason.seasonCode;
                }
            }

            // Article Description: merge ordered attribute values with '-' separator,
            // max 40 chars, starting from yarn1 and skipping empty values.
            const descriptionSource: any = {};
            for (const field of ARTICLE_DESCRIPTION_SOURCE_FIELDS) {
                descriptionSource[field] = data[field] !== undefined ? data[field] : (existingItem as any)[field];
            }
            data.articleDescription = buildArticleDescription(descriptionSource);

            const updated = await prisma.extractionResultFlat.update({
                where: { id },
                data
            });

            // Only sync mcCode/hsnTaxCode across rows when majorCategory actually changed.
            if (data.majorCategory !== undefined && data.majorCategory !== existingItem.majorCategory && updated.majorCategory) {
                const expectedMcCode = getMcCodeByMajorCategory(updated.majorCategory) || null;
                const expectedHsnCode = getHsnCodeByMcCode(expectedMcCode) || null;
                void prisma.extractionResultFlat.updateMany({
                    where: { majorCategory: updated.majorCategory },
                    data: { mcCode: expectedMcCode, hsnTaxCode: expectedHsnCode }
                });
            }

            // If variantColor was updated on a non-generic, sync colour field too
            if (!existingItem.isGeneric && data.variantColor !== undefined) {
                data.colour = data.variantColor;
                await prisma.extractionResultFlat.update({
                    where: { id },
                    data: { colour: data.variantColor }
                });
            }

            // If this is a generic article being updated, sync changes to variants (fire-and-forget)
            if (existingItem.isGeneric) {
                void syncGenericToVariants(existingItem.id, data);
            }

            return res.json(updated);
        } catch (error) {
            console.error('Error updating item:', error);
            return res.status(500).json({ error: 'Failed to update item' });
        }
    }

    // Approve items
    static async approveItems(req: Request, res: Response) {
        try {
            const { ids } = req.body; // Array of UUIDs
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'No items selected' });
            }

            // @ts-ignore - Assuming userId is added to req by auth middleware
            const userId = req.user?.id;

            const whereClause: any = {
                id: { in: ids },
                approvalStatus: 'PENDING'
            };

            // RBAC: Enforce scope by role
            ApproverController.applyApproverScope(whereClause, req.user);

            // Lightweight pre-approval fill: only fix missing mcCode/hsnTaxCode on the exact rows being approved
            const rowsToFix = await prisma.extractionResultFlat.findMany({
                where: { ...whereClause, mcCode: null, majorCategory: { not: null } },
                select: { id: true, majorCategory: true }
            });
            for (const row of rowsToFix) {
                const mc = getMcCodeByMajorCategory(row.majorCategory);
                if (mc) {
                    void prisma.extractionResultFlat.update({
                        where: { id: row.id },
                        data: { mcCode: mc, hsnTaxCode: getHsnCodeByMcCode(mc) || null }
                    });
                }
            }

            const result = await prisma.extractionResultFlat.updateMany({
                where: whereClause,
                data: {
                    approvalStatus: 'APPROVED',
                    approvedBy: userId ? Number(userId) : null,
                    approvedAt: new Date(),
                    sapSyncStatus: 'NOT_SYNCED' // Ready for sync
                }
            });

            const approvedItems = await prisma.extractionResultFlat.findMany({
                where: {
                    ...whereClause,
                    approvalStatus: 'APPROVED'
                }
            });

            const syncResults = await syncApprovedItemsToSap(approvedItems);
            const approvedItemById = new Map(approvedItems.map((item) => [item.id, item]));

            // Phase 1: Persist SAP article creation/sync outcome first.
            const finalizedSyncResults = syncResults.map((syncResult: any) => ({ ...syncResult }));

            const syncUpdates = finalizedSyncResults.map((syncResult: any) => {
                const data: any = {
                    sapSyncStatus: syncResult.success ? SapSyncStatus.SYNCED : SapSyncStatus.FAILED,
                    sapSyncMessage: syncResult.message
                };

                if (syncResult.sapArticleNumber) {
                    data.sapArticleId = syncResult.sapArticleNumber;
                    data.articleNumber = syncResult.sapArticleNumber;
                }

                if (syncResult.approvedImageUrl) {
                    data.imageUrl = syncResult.approvedImageUrl;
                }

                return prisma.extractionResultFlat.update({
                    where: { id: syncResult.id },
                    data
                });
            });

            if (syncUpdates.length > 0) {
                await prisma.$transaction(syncUpdates);
            }

            // Phase 2: Upload approved image only after article creation is persisted.
            await Promise.all(finalizedSyncResults.map(async (syncResult: any) => {
                if (!syncResult.success || !syncResult.sapArticleNumber) {
                    console.log(`⏭ Skipping approved image upload for ${syncResult.id}: success=${syncResult.success}, articleNumber=${syncResult.sapArticleNumber || 'none'}`);
                    return null;
                }

                const approvedItem = approvedItemById.get(syncResult.id);
                if (!approvedItem?.imageUrl) {
                    console.warn(`⚠️ Approved image upload skipped for ${syncResult.id}: no source imageUrl in DB`);
                    await prisma.extractionResultFlat.update({
                        where: { id: syncResult.id },
                        data: {
                            sapSyncMessage: `${syncResult.message} | Approved image upload skipped: source image URL missing`
                        }
                    });
                    return null;
                }

                try {
                    console.log(`📦 Copying approved image for article ${syncResult.sapArticleNumber} from source to article-master bucket...`);
                    const approvedImageUpload = await storageService.uploadApprovedImageFromSourceUrl(
                        String(approvedItem.imageUrl),
                        String(syncResult.sapArticleNumber)
                    );

                    await prisma.extractionResultFlat.update({
                        where: { id: syncResult.id },
                        data: {
                            imageUrl: approvedImageUpload.url
                        }
                    });
                    console.log(`✅ Approved image saved to article-master: ${approvedImageUpload.url}`);
                    return null;
                } catch (error: any) {
                    console.error(`❌ Approved image upload failed for ${syncResult.id}:`, error?.message);
                    await prisma.extractionResultFlat.update({
                        where: { id: syncResult.id },
                        data: {
                            sapSyncMessage: `${syncResult.message} | Approved image upload failed: ${error?.message || 'unknown error'}`
                        }
                    });
                    return null;
                }
            }));

            const syncedCount = finalizedSyncResults.filter((r: any) => r.success).length;
            const failedCount = finalizedSyncResults.length - syncedCount;

            const failedIds = finalizedSyncResults
                .filter((r) => !r.success)
                .map((r) => r.id);

            if (failedIds.length > 0) {
                await prisma.extractionResultFlat.updateMany({
                    where: { id: { in: failedIds } },
                    data: {
                        approvalStatus: ApprovalStatus.PENDING,
                        approvedBy: null,
                        approvedAt: null
                    }
                });
            }

            // Auto-approve all variants of approved generic articles
            const successfullyApprovedIds = ids.filter((id: string) => !failedIds.includes(id));
            if (successfullyApprovedIds.length > 0) {
                await prisma.extractionResultFlat.updateMany({
                    where: {
                        genericArticleId: { in: successfullyApprovedIds },
                        isGeneric: false,
                        approvalStatus: 'PENDING'
                    },
                    data: {
                        approvalStatus: 'APPROVED',
                        approvedBy: userId ? Number(userId) : null,
                        approvedAt: new Date(),
                        sapSyncStatus: 'NOT_SYNCED'
                    }
                });
            }

            return res.json({
                message: 'Items approved successfully',
                count: result.count,
                sapSync: {
                    totalAttempted: finalizedSyncResults.length,
                    synced: syncedCount,
                    failed: failedCount
                }
            });
        } catch (error) {
            console.error('Error approving items:', error);
            return res.status(500).json({ error: 'Failed to approve items' });
        }
    }

    // Reject items
    static async rejectItems(req: Request, res: Response) {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'No items selected' });
            }

            // @ts-ignore
            const userId = req.user?.id;

            const whereClause: any = {
                id: { in: ids }
            };

            // RBAC: Enforce scope by role
            ApproverController.applyApproverScope(whereClause, req.user);

            const result = await prisma.extractionResultFlat.updateMany({
                where: whereClause,
                data: {
                    approvalStatus: 'REJECTED',
                    sapSyncStatus: SapSyncStatus.NOT_SYNCED,
                    sapSyncMessage: 'Rejected by approver',
                    approvedBy: userId ? Number(userId) : null,
                    approvedAt: new Date()
                }
            });

            // Auto-reject all variants of rejected generic articles
            const rejectedIds = ids;
            await prisma.extractionResultFlat.updateMany({
                where: {
                    genericArticleId: { in: rejectedIds },
                    isGeneric: false
                },
                data: {
                    approvalStatus: 'REJECTED',
                    sapSyncStatus: SapSyncStatus.NOT_SYNCED,
                    sapSyncMessage: 'Rejected with generic article',
                    approvedBy: userId ? Number(userId) : null,
                    approvedAt: new Date()
                }
            });

            return res.json({
                message: 'Items rejected',
                count: result.count
            });
        } catch (error) {
            console.error('Error rejecting items:', error);
            return res.status(500).json({ error: 'Failed to reject items' });
        }
    }

    // Push generic's colour to all variants that have no variantColor set
    static async syncColorToVariants(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const generic = await prisma.extractionResultFlat.findUnique({
                where: { id },
                select: { id: true, colour: true, isGeneric: true }
            });
            if (!generic?.isGeneric) return res.status(400).json({ error: 'Not a generic article' });
            if (!generic.colour) return res.json({ message: 'Generic has no colour to sync', count: 0 });

            const result = await prisma.extractionResultFlat.updateMany({
                where: { genericArticleId: id, isGeneric: false, variantColor: null },
                data: { variantColor: generic.colour, colour: generic.colour }
            });
            return res.json({ message: `Synced colour to ${result.count} variants`, count: result.count });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Get all variants for a generic article
    static async getVariants(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const variants = await prisma.extractionResultFlat.findMany({
                where: { genericArticleId: id, isGeneric: false },
                orderBy: [{ variantColor: 'asc' }, { variantSize: 'asc' }]
            });
            return res.json({ data: variants });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Add color variants to an existing generic article
    static async addColor(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { color } = req.body;
            if (!color?.trim()) return res.status(400).json({ error: 'Color is required' });

            const count = await addColorVariants(id, color.trim());
            return res.json({ message: `Created ${count} color variants`, count });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Refresh image URL for a flat record — fixes expired signed URLs
    static async getImageUrl(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const record = await prisma.extractionResultFlat.findUnique({
                where: { id },
                select: { imageUrl: true }
            });

            if (!record?.imageUrl) {
                return res.status(404).json({ error: 'No image found for this record' });
            }

            const storedUrl = record.imageUrl;

            const publicBase = (process.env.R2_PUBLIC_URL_BASE || '').replace(/\/$/, '');
            const approvedBase = (process.env.APPROVED_R2_PUBLIC_URL_BASE || '').replace(/\/$/, '');

            // If the URL is from the approved (article-master) bucket, always generate
            // a fresh signed URL — the public URL may not be accessible if the bucket
            // does not have public access enabled in Cloudflare.
            if (approvedBase && storedUrl.startsWith(approvedBase + '/')) {
                const approvedKey = storageService.extractApprovedKeyFromUrl(storedUrl);
                if (approvedKey) {
                    const signedUrl = await storageService.getApprovedSignedUrl(approvedKey, 3600);
                    return res.json({ url: signedUrl });
                }
                // Key extraction failed — return as-is
                return res.json({ url: storedUrl });
            }

            // If it's a primary bucket public URL, return it as-is (bucket is public)
            if (publicBase && storedUrl.startsWith(publicBase + '/')) {
                return res.json({ url: storedUrl });
            }

            // Extract the object key from a signed URL (works for signed R2 URLs)
            let key: string | null = null;
            try {
                const parsed = new URL(storedUrl);
                // Signed URL path: /<bucket>/<key> or just /<key>
                let pathname = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
                const bucket = process.env.R2_BUCKET_NAME || '';
                if (bucket && pathname.startsWith(bucket + '/')) {
                    pathname = pathname.slice(bucket.length + 1);
                }
                key = pathname || null;
            } catch {
                key = null;
            }

            if (!key) {
                // Can't reconstruct — return whatever is stored
                return res.json({ url: storedUrl });
            }

            // Build a fresh public URL if base is configured, else generate a new signed URL
            let freshUrl: string;
            if (publicBase) {
                freshUrl = `${publicBase}/${key}`;
            } else {
                freshUrl = await storageService.getSignedUrl(key, 604800);
            }

            // Persist the fresh URL so future loads are instant
            await prisma.extractionResultFlat.update({
                where: { id },
                data: { imageUrl: freshUrl }
            });

            return res.json({ url: freshUrl });
        } catch (error) {
            console.error('Error refreshing image URL:', error);
            return res.status(500).json({ error: 'Failed to refresh image URL' });
        }
    }
}
