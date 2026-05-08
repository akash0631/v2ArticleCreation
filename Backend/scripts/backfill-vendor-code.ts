/**
 * Backfill: trim vendor codes to last 6 digits
 *
 * Finds all ExtractionResultFlat rows where vendorCode is longer than 6 chars
 * and updates them to the last 6 characters.
 *
 * Run:
 *   npx ts-node --project tsconfig.json scripts/backfill-vendor-code.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching records with vendor codes longer than 6 digits...');

  const records = await prisma.extractionResultFlat.findMany({
    where: {
      vendorCode: { not: null },
    },
    select: { id: true, vendorCode: true },
  });

  const toFix = records.filter(r => r.vendorCode && r.vendorCode.length > 6);

  console.log(`Total records with vendorCode: ${records.length}`);
  console.log(`Records needing trim:          ${toFix.length}`);

  if (toFix.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let updated = 0;
  for (const record of toFix) {
    const trimmed = record.vendorCode!.slice(-6);
    await prisma.extractionResultFlat.update({
      where: { id: record.id },
      data: { vendorCode: trimmed },
    });
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Updated ${updated}/${toFix.length}...`);
    }
  }

  console.log(`Done. Trimmed ${updated} vendor codes.`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
