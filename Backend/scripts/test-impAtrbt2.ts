import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
    // 1. Check what's in the DB for impAtrbt2
    console.log('\n=== DB CHECK: Articles with impAtrbt2 set ===');
    const withValue = await prisma.extractionResultFlat.findMany({
        where: { impAtrbt2: { not: null } },
        select: { id: true, articleNumber: true, designNumber: true, impAtrbt2: true },
        take: 10,
    });
    console.log(`Found ${withValue.length} articles with impAtrbt2:`);
    withValue.forEach(r => console.log(`  articleNumber=${r.articleNumber ?? 'N/A'} designNumber=${r.designNumber} impAtrbt2="${r.impAtrbt2}"`));

    // 2. Check HF-2610 specifically (from screenshot)
    console.log('\n=== SPECIFIC: Design HF-2610 ===');
    const hf = await prisma.extractionResultFlat.findMany({
        where: { designNumber: { contains: 'HF-2610' } },
        select: { id: true, articleNumber: true, designNumber: true, impAtrbt2: true },
    });
    hf.forEach(r => console.log(`  id=${r.id} articleNumber=${r.articleNumber} designNumber=${r.designNumber} impAtrbt2="${r.impAtrbt2}"`));

    // 3. Try to set a value directly to verify saving works
    if (hf.length > 0) {
        const testId = hf[0].id;
        console.log(`\n=== TEST SAVE: Setting impAtrbt2='TEST_VALUE' on id=${testId} ===`);
        const updated = await prisma.extractionResultFlat.update({
            where: { id: testId },
            data: { impAtrbt2: 'TEST_VALUE' },
            select: { id: true, impAtrbt2: true },
        });
        console.log(`After update: impAtrbt2="${updated.impAtrbt2}"`);

        // Now re-fetch to confirm it persists
        const refetch = await prisma.extractionResultFlat.findUnique({
            where: { id: testId },
            select: { id: true, impAtrbt2: true },
        });
        console.log(`Re-fetch confirms: impAtrbt2="${refetch?.impAtrbt2}"`);

        // Restore original value
        await prisma.extractionResultFlat.update({
            where: { id: testId },
            data: { impAtrbt2: hf[0].impAtrbt2 },
        });
        console.log(`Restored to original: "${hf[0].impAtrbt2}"`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
