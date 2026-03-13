/**
 * Backfill imageUrl values to use a stable public base URL.
 *
 * Usage:
 *   ts-node scripts/backfill-image-urls.ts --dry-run
 *   ts-node scripts/backfill-image-urls.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const isDryRun = process.argv.includes('--dry-run');

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '');
}

function buildPublicUrl(baseUrl: string, raw: string): string | null {
    if (!raw) return null;

    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const parsed = new URL(trimmed);
            const key = parsed.pathname.replace(/^\/+/, '');
            if (!key) return null;
            return `${baseUrl}/${key}`;
        } catch {
            return null;
        }
    }

    const key = trimmed.replace(/^\/+/, '');
    if (!key) return null;
    return `${baseUrl}/${key}`;
}

function getPublicBaseUrl(): string {
    const baseUrl = process.env.R2_PUBLIC_URL_BASE;
    if (!baseUrl) {
        throw new Error('R2_PUBLIC_URL_BASE is not set');
    }
    return normalizeBaseUrl(baseUrl);
}

async function backfillExtractionJobs() {
    const publicBase = getPublicBaseUrl();

    const rows = await prisma.extractionJob.findMany({
        where: {
            OR: [
                { imageUrl: { contains: 'r2.cloudflarestorage.com' } },
                { imageUrl: { contains: 'X-Amz-' } },
                { imageUrl: { startsWith: '/' } },
                { imageUrl: { startsWith: 'fashion-images' } }
            ]
        },
        select: {
            id: true,
            imageUrl: true
        }
    });

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const currentUrl = row.imageUrl || '';
        const newUrl = buildPublicUrl(publicBase, currentUrl);

        if (!newUrl || newUrl === currentUrl) {
            skipped++;
            continue;
        }

        if (isDryRun) {
            updated++;
            continue;
        }

        await prisma.extractionJob.update({
            where: { id: row.id },
            data: { imageUrl: newUrl }
        });
        updated++;
    }

    console.log(`\nextractionJob: ${rows.length} candidates`);
    console.log(`extractionJob: ${updated} updated${isDryRun ? ' (dry-run)' : ''}`);
    console.log(`extractionJob: ${skipped} skipped`);
}

async function backfillExtractionResultFlat() {
    const publicBase = getPublicBaseUrl();

    const rows = await prisma.extractionResultFlat.findMany({
        where: {
            OR: [
                { imageUrl: { contains: 'r2.cloudflarestorage.com' } },
                { imageUrl: { contains: 'X-Amz-' } },
                { imageUrl: { startsWith: '/' } },
                { imageUrl: { startsWith: 'fashion-images' } }
            ]
        },
        select: {
            id: true,
            imageUrl: true
        }
    });

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const currentUrl = row.imageUrl || '';
        const newUrl = buildPublicUrl(publicBase, currentUrl);

        if (!newUrl || newUrl === currentUrl) {
            skipped++;
            continue;
        }

        if (isDryRun) {
            updated++;
            continue;
        }

        await prisma.extractionResultFlat.update({
            where: { id: row.id },
            data: { imageUrl: newUrl }
        });
        updated++;
    }

    console.log(`\nextractionResultFlat: ${rows.length} candidates`);
    console.log(`extractionResultFlat: ${updated} updated${isDryRun ? ' (dry-run)' : ''}`);
    console.log(`extractionResultFlat: ${skipped} skipped`);
}

async function run() {
    console.log('🔧 Backfill imageUrl to public base URL');
    console.log(`Dry run: ${isDryRun ? 'yes' : 'no'}`);

    await backfillExtractionJobs();
    await backfillExtractionResultFlat();

    await prisma.$disconnect();
}

run().catch(async (error) => {
    console.error('❌ Backfill failed:', error);
    await prisma.$disconnect();
    process.exit(1);
});
