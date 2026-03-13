import { PrismaClient } from '../src/generated/prisma';
import { getHsnCodeByMcCode, getMcCodeByMajorCategory } from '../src/utils/mcCodeMapper';

const prisma = new PrismaClient();

async function main() {
  const batchSize = 2000;
  let totalUpdated = 0;

  // Strict reset: keep mcCode only for categories that are directly mapped in JSON.
  await prisma.extractionResultFlat.updateMany({ data: { mcCode: null } });

  while (true) {
    const rows = await prisma.extractionResultFlat.findMany({
      where: {
        mcCode: null,
        majorCategory: { not: null }
      },
      select: {
        id: true,
        majorCategory: true
      },
      take: batchSize
    });

    if (rows.length === 0) break;

    const idsByCode = new Map<string, string[]>();

    for (const row of rows) {
      const code = getMcCodeByMajorCategory(row.majorCategory);
      if (!code) continue;
      const ids = idsByCode.get(code) || [];
      ids.push(row.id);
      idsByCode.set(code, ids);
    }

    if (idsByCode.size === 0) break;

    const tx = Array.from(idsByCode.entries()).map(([mcCode, ids]) =>
      prisma.extractionResultFlat.updateMany({
        where: { id: { in: ids } },
        data: {
          mcCode,
          hsnTaxCode: getHsnCodeByMcCode(mcCode)
        }
      })
    );

    const results = await prisma.$transaction(tx);
    const updated = results.reduce((sum, r) => sum + r.count, 0);
    totalUpdated += updated;

    if (updated === 0) break;
    console.log(`Updated in batch: ${updated} | Total updated: ${totalUpdated}`);
  }

  console.log(`MC code backfill complete. Total rows updated: ${totalUpdated}`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
