import { Request, Response } from 'express';
import { ApprovalStatus, SapSyncStatus } from '../generated/prisma';
import { getHsnCodeByMcCode, getMcCodeByMajorCategory } from '../utils/mcCodeMapper';
import { calculateMrpFromRate, parseNumericValue } from '../utils/mrpCalculator';
import { getSegmentByCategoryAndMrp } from '../utils/segmentRangeMapper';
import { syncApprovedItemsToSap } from '../services/sapSyncService';
import { ARTICLE_DESCRIPTION_SOURCE_FIELDS, buildArticleDescription } from '../utils/articleDescriptionBuilder';
import { prismaClient as prisma } from '../utils/prisma';

export class ApproverController {
    private static readonly SEGMENT_RANGE_ERROR = 'MRP is outside the allowed segment ranges for this category.';

    private static getCurrentYearString(): string {
        return String(new Date().getFullYear());
    }

    private static applyApproverScope(where: any, user?: Express.Request['user']) {
        const role = String(user?.role || '');
        if (role === 'APPROVER') {
            if (user?.division) where.division = user.division;
            if (user?.subDivision) where.subDivision = user.subDivision;
            return;
        }

        if (role === 'CATEGORY_HEAD') {
            if (user?.division) where.division = user.division;
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
            if (status && status !== 'ALL') {
                const statuses = (status as string).split(',').map(s => s.trim()) as ApprovalStatus[];
                if (statuses.length > 0) {
                    where.approvalStatus = { in: statuses };
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
                'composition', 'finish', 'gsm', 'shade', 'lycra', 'neck', 'neckDetails',
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
                    } else if (value === '') {
                        // Convert empty strings to null for optional text fields
                        // Actually extractionResultFlat fields are mostly nullable strings, so '' might be okay or null preference.
                        // Let's stick to null for empty strings to be cleaner
                        value = null;
                    }

                    data[field] = value;
                }
            }

            // If rate/cost is provided, always derive MRP using:
            // rate + 33%, rounded UP to nearest multiple of 25.
            if (data.rate !== undefined) {
                data.mrp = calculateMrpFromRate(data.rate);
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
                if (req.user?.division && existingItem.division !== req.user.division) {
                    return res.status(403).json({ error: 'Access denied: Division mismatch' });
                }
                if (role === 'APPROVER' && req.user?.subDivision && existingItem.subDivision !== req.user.subDivision) {
                    return res.status(403).json({ error: 'Access denied: Sub-Division mismatch' });
                }
            }

            const finalMajorCategory = (data.majorCategory !== undefined ? data.majorCategory : existingItem.majorCategory) as string | null;
            const finalMrp = data.mrp !== undefined ? data.mrp : existingItem.mrp;

            if (finalMajorCategory && finalMrp !== null && finalMrp !== undefined) {
                const segment = getSegmentByCategoryAndMrp(finalMajorCategory, finalMrp);
                if (!segment) {
                    return res.status(400).json({
                        error: ApproverController.SEGMENT_RANGE_ERROR
                    });
                }

                data.segment = segment;
            }

            // Year always follows current date year (e.g. 02-Mar-2026 => 2026)
            data.year = ApproverController.getCurrentYearString();

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

            const syncUpdates = syncResults.map((syncResult) => {
                const data: any = {
                    sapSyncStatus: syncResult.success ? SapSyncStatus.SYNCED : SapSyncStatus.FAILED,
                    sapSyncMessage: syncResult.message
                };

                if (syncResult.sapArticleNumber) {
                    data.sapArticleId = syncResult.sapArticleNumber;
                    data.articleNumber = syncResult.sapArticleNumber;
                }

                return prisma.extractionResultFlat.update({
                    where: { id: syncResult.id },
                    data
                });
            });

            if (syncUpdates.length > 0) {
                await prisma.$transaction(syncUpdates);
            }

            const syncedCount = syncResults.filter((r) => r.success).length;
            const failedCount = syncResults.length - syncedCount;

            const failedIds = syncResults
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
                    totalAttempted: syncResults.length,
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
