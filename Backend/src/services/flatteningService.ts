import { getMcCodeByMajorCategory } from '../utils/mcCodeMapper';
import { prismaClient as prisma } from '../utils/prisma';

/**
 * Sanitize a value that should be numeric.
 * Handles: "562/-" → 562, "562/" → 562, "₹562" → 562, "WIP" → null, "N/A" → null
 */
function parseNumericValue(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return isNaN(value) ? null : value;

    const cleaned = String(value)
        .replace(/[₹$€£¥]/g, '')   // strip currency symbols
        .replace(/\s+/g, '')        // strip whitespace
        .replace(/\/-$/, '')        // strip trailing /-
        .replace(/\/$/, '')         // strip trailing /
        .replace(/-$/, '')          // strip trailing -
        .trim();

    const match = cleaned.match(/^-?\d+(\.\d+)?/);
    if (!match) return null;

    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
}

export class FlatteningService {
    /**
     * Flatten extraction job results into the flat table for fast querying
     */
    async flattenExtractionResults(jobId: string): Promise<void> {
        const job = await prisma.extractionJob.findUnique({
            where: { id: jobId },
            include: {
                results: { include: { attribute: true } },
                category: {
                    include: {
                        subDepartment: {
                            include: { department: true }
                        }
                    }
                },
                user: true
            }
        });

        if (!job) {
            console.warn(`Job ${jobId} not found, skipping flattening`);
            return;
        }

        const existingFlat = await prisma.extractionResultFlat.findUnique({
            where: { jobId },
            select: { vendorCode: true }
        });

        const flatData = this.mapToFlatStructure(job, existingFlat?.vendorCode || null);

        // Upsert to flat table (create or update)
        await prisma.extractionResultFlat.upsert({
            where: { jobId },
            create: flatData,
            update: flatData
        });

        console.log(`✅ Flattened extraction job ${jobId}`);
    }

    /**
     * Map extraction job to flat structure
     */
    private mapToFlatStructure(job: any, existingVendorCode: string | null = null): any {
        const resultsMap = new Map();

        // Build map of attribute key -> value
        job.results.forEach((result: any) => {
            const key = result.attribute.key.toLowerCase();
            resultsMap.set(key, result.finalValue || result.rawValue);
        });

        // Extract image name from URL
        // imageName = UUID-based filename for internal storage
        // articleNumber = original uploaded filename (stored in job.designNumber)
        let imageName = null;
        let articleNumber = null;

        if (job.imageUrl) {
            const fullFilename = job.imageUrl.split('/').pop()?.split('?')[0] || '';
            // Remove file extension
            const nameWithoutExt = fullFilename.replace(/\.[^/.]+$/, '');
            imageName = nameWithoutExt; // UUID for internal use
        }

        // Use job.designNumber as article number (it stores the original filename from upload)
        // Fall back to UUID if designNumber is not set
        articleNumber = job.designNumber || imageName;

        return {
            jobId: job.id,

            // Essential Metadata
            imageName, // UUID-based filename for internal use
            imageUrl: job.imageUrl,
            articleNumber, // Original uploaded filename
            extractionStatus: job.status,
            aiModel: job.aiModel,
            avgConfidence: job.avgConfidence,
            processingTimeMs: job.processingTimeMs,
            totalAttributes: job.totalAttributes,
            extractedCount: job.extractedCount,
            inputTokens: job.inputTokens,
            outputTokens: job.outputTokens,
            totalTokens: job.tokensUsed || (job.inputTokens && job.outputTokens ? job.inputTokens + job.outputTokens : null),
            apiCost: job.apiCost,
            userId: job.userId,
            userName: job.user?.name,
            extractionDate: job.completedAt || job.createdAt,

            // All 41 Attributes
            majorCategory: resultsMap.get('major_category') || job.category?.code, // T-Shirt, Jeans, etc.
            mcCode: getMcCodeByMajorCategory(resultsMap.get('major_category') || job.category?.code),
            vendorName: resultsMap.get('vendor_name'),
            designNumber: resultsMap.get('design_number'),
            pptNumber: resultsMap.get('ppt_number'),
            rate: parseNumericValue(resultsMap.get('rate')),
            size: resultsMap.get('size'),
            yarn1: resultsMap.get('yarn_01'),
            yarn2: resultsMap.get('yarn_02'),
            fabricMainMvgr: resultsMap.get('fabric_main_mvgr'),
            weave: resultsMap.get('weave'),
            composition: resultsMap.get('composition'),
            finish: resultsMap.get('finish'),
            gsm: resultsMap.get('gram_per_square_meter'),
            shade: resultsMap.get('shade'),
            lycra: resultsMap.get('lycra_non_lycra') || resultsMap.get('lycra_non\nlycra'),
            neck: resultsMap.get('neck'),
            neckDetails: resultsMap.get('neck_detail'),
            collar: resultsMap.get('collar'),
            placket: resultsMap.get('placket'),
            sleeve: resultsMap.get('sleeve'),
            bottomFold: resultsMap.get('bottom_fold'),
            frontOpenStyle: resultsMap.get('front_open_style'),
            pocketType: resultsMap.get('pocket_type'),
            fit: resultsMap.get('fit'),
            pattern: resultsMap.get('pattern'),
            length: resultsMap.get('length'),
            colour: resultsMap.get('color'),
            drawcord: resultsMap.get('drawcord'),
            button: resultsMap.get('button'),
            zipper: resultsMap.get('zipper'),
            zipColour: resultsMap.get('zip_colour'),
            printType: resultsMap.get('print_type'),
            printStyle: resultsMap.get('print_style'),
            printPlacement: resultsMap.get('print_placement'),
            patches: resultsMap.get('patches'),
            patchesType: resultsMap.get('patch_type'),
            embroidery: resultsMap.get('embroidery'),
            embroideryType: resultsMap.get('embroidery_type'),
            wash: resultsMap.get('wash'),
            fatherBelt: resultsMap.get('father_belt'),
            childBelt: resultsMap.get('child_belt_detail'),
            vendorCode: resultsMap.get('vendor_code') || resultsMap.get('vendor code') || existingVendorCode || null,

            // Hierarchy Mapping
            division: job.category?.subDepartment?.department?.name || resultsMap.get('division') || null,
            subDivision: job.category?.subDepartment?.code || null, // ML, MU etc.
            referenceArticleNumber: null,
            referenceArticleDescription: null,
        };
    }

    /**
     * Batch flatten multiple extraction jobs
     */
    async flattenMultipleJobs(jobIds: string[]): Promise<void> {
        console.log(`🔄 Flattening ${jobIds.length} extraction jobs...`);

        let successCount = 0;
        let errorCount = 0;

        for (const jobId of jobIds) {
            try {
                await this.flattenExtractionResults(jobId);
                successCount++;
            } catch (error) {
                console.error(`❌ Error flattening job ${jobId}:`, error);
                errorCount++;
            }
        }

        console.log(`\n📊 Flattening Summary:`);
        console.log(`   ✅ Success: ${successCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);
    }
}

export const flatteningService = new FlatteningService();
