/**
 * Backfill missing GSM and G-Weight values in extractionResultFlat.
 *
 * Reads from ExtractionResult rows linked to GSM / weight MasterAttributes
 * and updates any flat rows that still have null gsm or weight.
 *
 * Usage:
 *   ts-node scripts/backfill-gsm-weight.ts --dry-run
 *   ts-node scripts/backfill-gsm-weight.ts
 */

import { prismaClient as prisma } from '../src/utils/prisma';

const isDryRun = process.argv.includes('--dry-run');

// MasterAttribute keys that map to gsm (case-insensitive match)
const GSM_KEYS = ['gsm', 'gram_per_square_meter', 'gram per square meter', 'grams_per_square_meter'];
// MasterAttribute keys that map to weight (case-insensitive match)
const WEIGHT_KEYS = ['weight', 'g_weight', 'g-weight', 'gweight', 'gram_weight', 'g weight'];

function extractNumericWeight(value: string | null | undefined): string | null {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    return match ? match[1] : null;
}

async function run() {
    console.log('🔧 Backfill missing GSM and G-Weight in extractionResultFlat');
    console.log(`Dry run: ${isDryRun ? 'yes' : 'no'}\n`);

    // Find all MasterAttribute IDs for gsm and weight
    const allAttributes = await prisma.masterAttribute.findMany({
        select: { id: true, key: true, label: true },
    });

    const gsmAttrIds = allAttributes
        .filter(a => GSM_KEYS.includes(a.key.toLowerCase().trim()))
        .map(a => a.id);

    const weightAttrIds = allAttributes
        .filter(a => WEIGHT_KEYS.includes(a.key.toLowerCase().trim()))
        .map(a => a.id);

    console.log(`GSM MasterAttribute IDs:    [${gsmAttrIds.join(', ')}]`);
    console.log(
        `GSM keys found: ${allAttributes
            .filter(a => GSM_KEYS.includes(a.key.toLowerCase().trim()))
            .map(a => a.key)
            .join(', ') || '(none)'}`
    );
    console.log(`Weight MasterAttribute IDs: [${weightAttrIds.join(', ')}]`);
    console.log(
        `Weight keys found: ${allAttributes
            .filter(a => WEIGHT_KEYS.includes(a.key.toLowerCase().trim()))
            .map(a => a.key)
            .join(', ') || '(none)'}\n`
    );

    let gsmUpdated = 0;
    let weightUpdated = 0;
    let gsmSkipped = 0;
    let weightSkipped = 0;

    // ── GSM ──────────────────────────────────────────────────────────────────
    if (gsmAttrIds.length > 0) {
        // Find ExtractionResult rows for GSM attributes where the flat row has null gsm
        const gsmResults = await prisma.extractionResult.findMany({
            where: {
                attributeId: { in: gsmAttrIds },
                OR: [
                    { rawValue: { not: null } },
                    { finalValue: { not: null } },
                ],
                job: {
                    flatResult: {
                        gsm: null,
                    },
                },
            },
            select: {
                jobId: true,
                rawValue: true,
                finalValue: true,
                job: {
                    select: {
                        flatResult: { select: { id: true, gsm: true } },
                    },
                },
            },
        });

        console.log(`GSM: ${gsmResults.length} ExtractionResult rows found with null gsm in flat`);

        for (const er of gsmResults) {
            const flatId = er.job.flatResult?.id;
            if (!flatId) { gsmSkipped++; continue; }

            const raw = er.finalValue ?? er.rawValue;
            if (!raw || String(raw).trim() === '') { gsmSkipped++; continue; }

            const value = String(raw).trim();

            if (!isDryRun) {
                await prisma.extractionResultFlat.update({
                    where: { id: flatId },
                    data: { gsm: value },
                });
            } else {
                console.log(`  [dry-run] Would set gsm="${value}" on flatId=${flatId} (jobId=${er.jobId})`);
            }
            gsmUpdated++;
        }
    } else {
        console.log('GSM: No matching MasterAttributes found — skipping GSM backfill');
    }

    // ── Weight ───────────────────────────────────────────────────────────────
    if (weightAttrIds.length > 0) {
        const weightResults = await prisma.extractionResult.findMany({
            where: {
                attributeId: { in: weightAttrIds },
                OR: [
                    { rawValue: { not: null } },
                    { finalValue: { not: null } },
                ],
                job: {
                    flatResult: {
                        weight: null,
                    },
                },
            },
            select: {
                jobId: true,
                rawValue: true,
                finalValue: true,
                job: {
                    select: {
                        flatResult: { select: { id: true, weight: true } },
                    },
                },
            },
        });

        console.log(`Weight: ${weightResults.length} ExtractionResult rows found with null weight in flat`);

        for (const er of weightResults) {
            const flatId = er.job.flatResult?.id;
            if (!flatId) { weightSkipped++; continue; }

            const raw = er.finalValue ?? er.rawValue;
            if (!raw || String(raw).trim() === '') { weightSkipped++; continue; }

            const value = extractNumericWeight(raw);
            if (!value) { weightSkipped++; continue; }

            if (!isDryRun) {
                await prisma.extractionResultFlat.update({
                    where: { id: flatId },
                    data: { weight: value },
                });
            } else {
                console.log(`  [dry-run] Would set weight="${value}" on flatId=${flatId} (jobId=${er.jobId})`);
            }
            weightUpdated++;
        }
    } else {
        console.log('Weight: No matching MasterAttributes found — skipping weight backfill');
    }

    console.log('\n── Summary ─────────────────────────────────────────────────────────────');
    console.log(`GSM:    ${gsmUpdated} ${isDryRun ? 'would be updated' : 'updated'}, ${gsmSkipped} skipped`);
    console.log(`Weight: ${weightUpdated} ${isDryRun ? 'would be updated' : 'updated'}, ${weightSkipped} skipped`);
}

run()
    .catch((error) => {
        console.error('❌ Backfill failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
