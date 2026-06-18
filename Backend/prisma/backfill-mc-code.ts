/**
 * backfill-mc-code.ts
 *
 * One-time backfill: update mcCode and hsnTaxCode in extractionResultFlat
 * for all records where stored values don't match the JSON source of truth.
 *
 * Run: npx ts-node prisma/backfill-mc-code.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import { getMcCodeByMajorCategory, getHsnCodeByMcCode } from '../src/utils/mcCodeMapper';

const prisma = new PrismaClient();

async function main() {
  const records = await prisma.extractionResultFlat.findMany({
    where: { majorCategory: { not: null } },
    select: { id: true, majorCategory: true, mcCode: true, hsnTaxCode: true },
  });

  console.log(`Found ${records.length} records with a majorCategory`);

  let updated = 0;
  let skipped = 0;
  let noMapping = 0;

  for (const rec of records) {
    const correctMcCode = getMcCodeByMajorCategory(rec.majorCategory);
    if (!correctMcCode) { noMapping++; continue; }

    const correctHsn = getHsnCodeByMcCode(correctMcCode) ?? null;
    const patch: Record<string, string | null> = {};

    if (rec.mcCode !== correctMcCode) patch.mcCode = correctMcCode;
    if (rec.hsnTaxCode !== correctHsn) patch.hsnTaxCode = correctHsn;

    if (Object.keys(patch).length === 0) { skipped++; continue; }

    await prisma.extractionResultFlat.update({
      where: { id: rec.id },
      data: patch,
    });
    console.log(`  Updated id=${rec.id}  majorCategory=${rec.majorCategory}  mcCode: ${rec.mcCode ?? 'null'} → ${correctMcCode}  hsn: ${rec.hsnTaxCode ?? 'null'} → ${correctHsn ?? 'null'}`);
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
