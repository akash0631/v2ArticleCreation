/**
 * backfill-mc-code.ts
 *
 * One-time backfill: update mcCode in extractionResultFlat for all records
 * where the stored value doesn't match what mc-code-list-major-category.json
 * derives from majorCategory.
 *
 * Run: npx ts-node prisma/backfill-mc-code.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import { getMcCodeByMajorCategory } from '../src/utils/mcCodeMapper';

const prisma = new PrismaClient();

async function main() {
  const records = await prisma.extractionResultFlat.findMany({
    where: { majorCategory: { not: null } },
    select: { id: true, majorCategory: true, mcCode: true },
  });

  console.log(`Found ${records.length} records with a majorCategory`);

  let updated = 0;
  let skipped = 0;
  let noMapping = 0;

  for (const rec of records) {
    const correct = getMcCodeByMajorCategory(rec.majorCategory);
    if (!correct) { noMapping++; continue; }
    if (rec.mcCode === correct) { skipped++; continue; }

    await prisma.extractionResultFlat.update({
      where: { id: rec.id },
      data: { mcCode: correct },
    });
    console.log(`  Updated id=${rec.id}  majorCategory=${rec.majorCategory}  ${rec.mcCode ?? 'null'} → ${correct}`);
    updated++;
  }

  console.log(`\nDone!`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Skipped   : ${skipped} (already correct)`);
  console.log(`  No mapping: ${noMapping} (majorCategory not in JSON)`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
