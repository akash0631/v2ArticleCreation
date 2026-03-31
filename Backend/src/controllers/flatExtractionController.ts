import { Request, Response, NextFunction } from 'express';
import { prismaClient as prisma } from '../utils/prisma';
import { getHsnCodeByMcCode, getMcCodeByMajorCategory } from '../utils/mcCodeMapper';
import { calculateMrpFromRate, parseNumericValue } from '../utils/mrpCalculator';

export class FlatExtractionController {
    private attributeKeyToFieldMap: Record<string, string> = {
        major_category: 'majorCategory',
        majorcategory: 'majorCategory',
        vendor_name: 'vendorName',
        design_number: 'designNumber',
        ppt_number: 'pptNumber',
        rate: 'rate',
        size: 'size',
        yarn_01: 'yarn1',
        yarn1: 'yarn1',
        yarn_02: 'yarn2',
        yarn2: 'yarn2',
        fabric_main_mvgr: 'fabricMainMvgr',
        weave: 'weave',
        composition: 'composition',
        finish: 'finish',
        gram_per_square_meter: 'gsm',
        gsm: 'gsm',
        shade: 'shade',
        weight: 'weight',
        g_weight: 'weight',
        gweight: 'weight',
        'g-weight': 'weight',
        lycra_non_lycra: 'lycra',
        'lycra_non\nlycra': 'lycra',
        lycra: 'lycra',
        neck: 'neck',
        neck_detail: 'neckDetails',
        neck_details: 'neckDetails',
        collar: 'collar',
        placket: 'placket',
        sleeve: 'sleeve',
        bottom_fold: 'bottomFold',
        front_open_style: 'frontOpenStyle',
        pocket_type: 'pocketType',
        fit: 'fit',
        pattern: 'pattern',
        length: 'length',
        colour: 'colour',
        color: 'colour',
        drawcord: 'drawcord',
        button: 'button',
        zipper: 'zipper',
        zip_colour: 'zipColour',
        print_type: 'printType',
        print_style: 'printStyle',
        print_placement: 'printPlacement',
        patches: 'patches',
        patch_type: 'patchesType',
        patches_type: 'patchesType',
        embroidery: 'embroidery',
        embroidery_type: 'embroideryType',
        wash: 'wash',
        father_belt: 'fatherBelt',
        child_belt: 'childBelt',
        child_belt_detail: 'childBelt',
        reference_article_number: 'referenceArticleNumber',
        reference_article_description: 'referenceArticleDescription'
    };

    private normalizeAttributeKey(key: string): string {
        return String(key || '').trim().toLowerCase();
    }

    private normalizeRole(role: unknown): string {
        return String(role || '').trim().toUpperCase();
    }

    private parseSubDivisions(value: unknown): string[] {
        if (value === null || value === undefined) return [];
        const tokens = String(value)
            .split(/[;,|]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        return Array.from(new Set(tokens));
    }

    private extractNumericWeight(input: unknown): string | null {
        if (input === null || input === undefined) return null;
        const text = String(input).trim();
        if (!text) return null;
        const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
        return match ? match[1] : null;
    }

    private isCreatorLike(role: string): boolean {
        const normalizedRole = this.normalizeRole(role);
        return normalizedRole === 'CREATOR' || normalizedRole === 'PO_COMMITTEE';
    }

    /**
     * Get all extraction jobs from flat table (fast query)
     */
    getAllFlat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = (req as any).user;
            const userId = user?.id;
            const role = this.normalizeRole(user?.role);
            const division = user?.division;
            const subDivision = user?.subDivision;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: 'Unauthorized'
                });
                return;
            }

            const where: any = {};

            // RBAC Filtering Logic (creator self-only, others as per scope)
            if (role === 'CREATOR' || role === 'PO_COMMITTEE') {
                // Creators and PO Committee only see their own extractions
                where.userId = userId;
            } else if (role === 'APPROVER') {
                // Approvers see extractions within their assigned scope
                if (division) where.division = division;
                const subDivisionList = this.parseSubDivisions(subDivision);
                if (subDivisionList.length === 1) {
                    where.subDivision = subDivisionList[0];
                } else if (subDivisionList.length > 1) {
                    where.subDivision = { in: subDivisionList };
                }
            } else if (role === 'CATEGORY_HEAD') {
                // Category heads see all extractions within their assigned division
                if (division) where.division = division;
            } else if (role === 'ADMIN') {
                // Admins see all - no filters applied
            } else {
                // Default to self-only for unknown roles (security first)
                where.userId = userId;
            }

            const flatResults = await prisma.extractionResultFlat.findMany({
                where,
                orderBy: [
                    { createdAt: 'desc' },
                    { id: 'desc' }
                ],
                take: 200, // Increased limit slightly for better overview
            });

            res.json({
                success: true,
                data: {
                    jobs: flatResults,
                    total: flatResults.length
                }
            });
        } catch (error) {
            console.error('Error fetching flat extraction results:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch extraction results'
            });
        }
    };

    /**
     * Get single extraction job from flat table
     */
    getOneFlat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { id } = req.params;

            const flatResult = await prisma.extractionResultFlat.findUnique({
                where: { jobId: id }
            });

            if (!flatResult) {
                res.status(404).json({
                    success: false,
                    error: 'Extraction job not found'
                });
                return;
            }

            res.json({
                success: true,
                data: flatResult
            });
        } catch (error) {
            console.error('Error fetching flat extraction result:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch extraction result'
            });
        }
    };

    /**
     * Update one editable attribute in flat table row by jobId
     */
    updateFlatAttributeByJobId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = (req as any).user;
            const userId = user?.id;
            const role = this.normalizeRole(user?.role);
            const division = user?.division;
            const subDivision = user?.subDivision;
            const { jobId } = req.params;
            const { attributeKey, value } = req.body || {};

            if (!userId) {
                res.status(401).json({ success: false, error: 'Unauthorized' });
                return;
            }

            if (!jobId) {
                res.status(400).json({ success: false, error: 'jobId is required' });
                return;
            }

            if (!attributeKey || typeof attributeKey !== 'string') {
                res.status(400).json({ success: false, error: 'attributeKey is required' });
                return;
            }

            const normalizedKey = this.normalizeAttributeKey(attributeKey);
            const fieldName = this.attributeKeyToFieldMap[normalizedKey];

            if (!fieldName) {
                res.status(400).json({ success: false, error: `Unsupported attributeKey: ${attributeKey}` });
                return;
            }

            const existing = await prisma.extractionResultFlat.findUnique({
                where: { jobId },
                select: {
                    id: true,
                    userId: true,
                    division: true,
                    subDivision: true,
                    approvalStatus: true,
                    majorCategory: true,
                    rate: true,
                    mrp: true
                }
            });

            if (!existing) {
                res.status(404).json({ success: false, error: 'Extraction row not found' });
                return;
            }

            if (existing.approvalStatus === 'APPROVED') {
                res.status(403).json({ success: false, error: 'Cannot update an approved item.' });
                return;
            }

            if (this.isCreatorLike(role)) {
                if (!existing.userId || Number(existing.userId) !== Number(userId)) {
                    res.status(403).json({ success: false, error: 'Access denied: Not your extraction.' });
                    return;
                }
            } else if (role === 'APPROVER') {
                if (division && existing.division && String(existing.division).toLowerCase() !== String(division).toLowerCase()) {
                    res.status(403).json({ success: false, error: 'Access denied: Division mismatch.' });
                    return;
                }
                const subDivisionList = this.parseSubDivisions(subDivision).map((item) => item.toLowerCase());
                if (subDivisionList.length > 0 && existing.subDivision) {
                    const existingSubDivision = String(existing.subDivision).toLowerCase();
                    if (!subDivisionList.includes(existingSubDivision)) {
                        res.status(403).json({ success: false, error: 'Access denied: Sub-Division mismatch.' });
                        return;
                    }
                }
            } else if (role === 'CATEGORY_HEAD') {
                if (division && existing.division && String(existing.division).toLowerCase() !== String(division).toLowerCase()) {
                    res.status(403).json({ success: false, error: 'Access denied: Division mismatch.' });
                    return;
                }
            }

            const toNullableString = (input: unknown): string | null => {
                if (input === null || input === undefined) return null;
                const text = String(input).trim();
                return text === '' ? null : text;
            };

            const data: Record<string, unknown> = {};

            if (fieldName === 'rate') {
                const parsedRate = parseNumericValue(value);
                data.rate = parsedRate;
                data.mrp = calculateMrpFromRate(parsedRate);
            } else if (fieldName === 'majorCategory') {
                const majorCategoryText = toNullableString(value);

                if (majorCategoryText) {
                    const mappedMcCode = getMcCodeByMajorCategory(majorCategoryText);
                    if (!mappedMcCode) {
                        res.status(400).json({
                            success: false,
                            error: `Invalid majorCategory '${majorCategoryText}'. Please use values from mc code list (mc des).`
                        });
                        return;
                    }

                    data.majorCategory = majorCategoryText;
                    data.mcCode = mappedMcCode;
                    data.hsnTaxCode = getHsnCodeByMcCode(mappedMcCode) || null;
                } else {
                    data.majorCategory = null;
                    data.mcCode = null;
                    data.hsnTaxCode = null;
                }
            } else {
                data[fieldName] = fieldName === 'weight'
                    ? this.extractNumericWeight(value)
                    : toNullableString(value);
            }

            const updated = await prisma.extractionResultFlat.update({
                where: { id: existing.id },
                data
            });

            res.json({
                success: true,
                data: updated
            });
        } catch (error) {
            console.error('Error updating extraction flat attribute:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to save extraction changes'
            });
        }
    };

    /**
     * Mark a flat extraction row as creator-reviewed.
     * Only reviewed rows (extractionStatus=COMPLETED) are visible in Products/Approver dashboards.
     */
    markFlatReviewCompleteByJobId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = (req as any).user;
            const userId = user?.id;
            const role = this.normalizeRole(user?.role);
            const division = user?.division;
            const subDivision = user?.subDivision;
            const { jobId } = req.params;
            const { checked } = req.body || {};

            if (!userId) {
                res.status(401).json({ success: false, error: 'Unauthorized' });
                return;
            }

            if (!jobId) {
                res.status(400).json({ success: false, error: 'jobId is required' });
                return;
            }

            if (typeof checked !== 'boolean') {
                res.status(400).json({ success: false, error: 'checked must be a boolean' });
                return;
            }

            const existing = await prisma.extractionResultFlat.findUnique({
                where: { jobId },
                select: {
                    id: true,
                    userId: true,
                    division: true,
                    subDivision: true,
                    approvalStatus: true
                }
            });

            if (!existing) {
                res.status(404).json({ success: false, error: 'Extraction row not found' });
                return;
            }

            if (existing.approvalStatus === 'APPROVED') {
                res.status(403).json({ success: false, error: 'Cannot mark an approved item.' });
                return;
            }

            if (this.isCreatorLike(role)) {
                if (!existing.userId || Number(existing.userId) !== Number(userId)) {
                    res.status(403).json({ success: false, error: 'Access denied: Not your extraction.' });
                    return;
                }
            } else if (role === 'APPROVER') {
                if (division && existing.division && String(existing.division).toLowerCase() !== String(division).toLowerCase()) {
                    res.status(403).json({ success: false, error: 'Access denied: Division mismatch.' });
                    return;
                }
                const subDivisionList = this.parseSubDivisions(subDivision).map((item) => item.toLowerCase());
                if (subDivisionList.length > 0 && existing.subDivision) {
                    const existingSubDivision = String(existing.subDivision).toLowerCase();
                    if (!subDivisionList.includes(existingSubDivision)) {
                        res.status(403).json({ success: false, error: 'Access denied: Sub-Division mismatch.' });
                        return;
                    }
                }
            } else if (role === 'CATEGORY_HEAD') {
                if (division && existing.division && String(existing.division).toLowerCase() !== String(division).toLowerCase()) {
                    res.status(403).json({ success: false, error: 'Access denied: Division mismatch.' });
                    return;
                }
            }

            const updated = await prisma.extractionResultFlat.update({
                where: { id: existing.id },
                data: {
                    extractionStatus: checked ? 'COMPLETED' : 'REVIEW_PENDING'
                }
            });

            res.json({
                success: true,
                data: updated
            });
        } catch (error) {
            console.error('Error marking extraction review completion:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update review completion'
            });
        }
    };
}

export const flatExtractionController = new FlatExtractionController();
