import { Request, Response, NextFunction } from 'express';
import { prismaClient as prisma } from '../utils/prisma';

export class FlatExtractionController {
    /**
     * Get all extraction jobs from flat table (fast query)
     */
    getAllFlat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = (req as any).user;
            const userId = user?.id;
            const role = user?.role;
            const division = user?.division;
            const subDivision = user?.subDivision;

            const where: any = {};

            // RBAC Filtering Logic
            if (role === 'CREATOR' || role === 'PO_COMMITTEE') {
                // Creators only see their own extractions
                where.userId = userId;
            } else if (role === 'APPROVER') {
                // Approvers see extractions within their assigned scope
                if (division) where.division = division;
                if (subDivision) where.subDivision = subDivision;
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
}

export const flatExtractionController = new FlatExtractionController();
