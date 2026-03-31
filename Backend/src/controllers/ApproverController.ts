import { Request, Response } from 'express';
import { ApprovalStatus, SapSyncStatus } from '../generated/prisma';
import { getHsnCodeByMcCode, getMcCodeByMajorCategory } from '../utils/mcCodeMapper';
import { calculateMrpFromRate, parseNumericValue } from '../utils/mrpCalculator';
import { getSegmentByCategoryAndMrp } from '../utils/segmentRangeMapper';
import { syncApprovedItemsToSap } from '../services/sapSyncService';
import { storageService } from '../services/storageService';
import { ARTICLE_DESCRIPTION_SOURCE_FIELDS, buildArticleDescription } from '../utils/articleDescriptionBuilder';
import { prismaClient as prisma } from '../utils/prisma';

export class ApproverController {
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

            if (variants.length === 1) {
                where.subDivision = { equals: variants[0], mode: 'insensitive' };
                return;
            }

            where.AND = where.AND || [];
            where.AND.push({
                OR: variants.map((variant) => ({
                    subDivision: { equals: variant, mode: 'insensitive' }
                }))
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
            take: 5000
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

        const results = await prisma.$transaction(updates);
        return results.reduce((sum, result) => sum + result.count, 0);
    }

    private static async backfillMissingHsnCodes(baseWhere: any): Promise<number> {
        const rows = await prisma.extractionResultFlat.findMany({
            where: {
                ...baseWhere,
                mcCode: { not: null }
            },
            select: {
                id: true,
                mcCode: true,
                hsnTaxCode: true
            },
            take: 5000
        });

        const idsByHsn = new Map<string, string[]>();

        for (const row of rows) {
            const mappedHsn = getHsnCodeByMcCode(row.mcCode);
            if (!mappedHsn) continue;
            if (row.hsnTaxCode === mappedHsn) continue;

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

        const results = await prisma.$transaction(updates);
        return results.reduce((sum, result) => sum + result.count, 0);
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
            take: 5000
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

        const results = await prisma.$transaction(updates);
        return results.reduce((sum, result) => sum + result.count, 0);
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
                yarn1: true,
                yarn2: true,
                fabricMainMvgr: true,
                weave: true,
                composition: true,
                finish: true,
                gsm: true,
                shade: true,
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
                childBelt: true
            },
            take: 5000
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

        const results = await prisma.$transaction(updates);
        return results.reduce((sum, result) => sum + result.count, 0);
    }

    // Get items for approver dashboard
    // Filters: approvalStatus (default: PENDING), division, date range, search
    static async getItems(req: Request, res: Response) {
        try {
            const { status, division, subDivision, startDate, endDate, search, page = 1, limit = 50 } = req.query;

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

            // Status Filtering (Multi-select support)
            // Supports virtual FAILED status mapped from sapSyncStatus=FAILED.
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

            const skip = (Number(page) - 1) * Number(limit);

            // Persist MC code in DB once for rows missing mcCode, so frontend doesn't
            // need to repeatedly map from JSON for the same records.
            await ApproverController.backfillMissingMcCodes(where);
            await ApproverController.backfillMissingHsnCodes(where);
            await ApproverController.backfillMissingSegments(where);
            await ApproverController.backfillMissingYears(where);
            await ApproverController.backfillMissingSeasonCodes(where);
            await ApproverController.refreshArticleDescriptions(where);

            const items = await prisma.extractionResultFlat.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
                include: {
                    job: {
                        select: {
                            status: true
                        }
                    }
                }
            });

            const total = await prisma.extractionResultFlat.count({ where });

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

    // Get master attributes for dropdowns
    static async getAttributes(req: Request, res: Response) {
        try {
            const attributes = await prisma.masterAttribute.findMany({
                where: { isActive: true },
                include: {
                    allowedValues: {
                        where: { isActive: true },
                        orderBy: { displayOrder: 'asc' }
                    }
                },
                orderBy: { displayOrder: 'asc' }
            });
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
                'vendorCode', 'mrp', 'mcCode', 'segment', 'season',
                'hsnTaxCode', 'articleDescription', 'fashionGrid', 'year', 'articleType'
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
                    season: true,
                    year: true
                }
            });

            if (!existingItem) {
                return res.status(404).json({ error: 'Item not found' });
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

            // Only derive MRP from rate when rate actually changes.
            // This prevents failed saves when the frontend sends full rows with unchanged values.
            if (rateActuallyChanged) {
                data.mrp = calculateMrpFromRate(incomingRate);
            } else if (
                data.rate === undefined &&
                data.mrp === undefined &&
                (existingItem.mrp === null || existingItem.mrp === undefined) &&
                existingRate !== null
            ) {
                // Backfill missing MRP from existing rate when any update is made.
                data.mrp = calculateMrpFromRate(existingRate);
            }

            const finalMajorCategory = (data.majorCategory !== undefined ? data.majorCategory : existingItem.majorCategory) as string | null;
            const finalMrp = data.mrp !== undefined ? data.mrp : existingItem.mrp;

            // Only enforce segment range check when MRP or majorCategory actually changed value
            const mrpActuallyChanged = data.mrp !== undefined && toComparableNumber(data.mrp) !== toComparableNumber(existingItem.mrp);
            const categoryActuallyChanged = data.majorCategory !== undefined && data.majorCategory !== existingItem.majorCategory;
            if ((mrpActuallyChanged || categoryActuallyChanged) && finalMajorCategory && finalMrp !== null && finalMrp !== undefined) {
                const segment = getSegmentByCategoryAndMrp(finalMajorCategory, finalMrp);
                if (!segment) {
                    return res.status(400).json({
                        error: ApproverController.SEGMENT_RANGE_ERROR
                    });
                }

                data.segment = segment;
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

            // Keep category-wise values strict and consistent for all rows.
            if (updated.majorCategory) {
                const expectedMcCode = getMcCodeByMajorCategory(updated.majorCategory) || null;
                const expectedHsnCode = getHsnCodeByMcCode(expectedMcCode) || null;
                await prisma.extractionResultFlat.updateMany({
                    where: {
                        majorCategory: updated.majorCategory
                    },
                    data: {
                        mcCode: expectedMcCode,
                        hsnTaxCode: expectedHsnCode
                    }
                });
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

            // Ensure selected rows have mcCode persisted before approval.
            await ApproverController.backfillMissingMcCodes(whereClause);
            await ApproverController.backfillMissingHsnCodes(whereClause);
            await ApproverController.backfillMissingYears(whereClause);
            await ApproverController.backfillMissingSeasonCodes(whereClause);
            await ApproverController.refreshArticleDescriptions(whereClause);

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
                    return null;
                }

                const approvedItem = approvedItemById.get(syncResult.id);
                if (!approvedItem?.imageUrl) {
                    await prisma.extractionResultFlat.update({
                        where: { id: syncResult.id },
                        data: {
                            sapSyncMessage: `${syncResult.message} | Approved image upload skipped: source image URL missing`
                        }
                    });
                    return null;
                }

                try {
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
                    return null;
                } catch (error: any) {
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
}
