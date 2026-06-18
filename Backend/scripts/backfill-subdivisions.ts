/**
 * Backfill subDivision for all watcher articles using their majorCategory.
 * Run: npx ts-node backfill-subdivisions.ts
 *
 * Logic:
 *   - majorCategory present → look up Category.code in DB → use SubDepartment.code as subDivision
 *   - majorCategory absent  → set subDivision = null
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// Load categoryMapping.json from watcher folder
const mappingPath = path.join(__dirname, '../../watcher/categoryMapping.json');
const categoryMapping: Record<string, { sub_division: string; mc_code: string; division: string }> = JSON.parse(
  fs.readFileSync(mappingPath, 'utf-8')
);

async function main() {
  console.log('🔄 Fetching all watcher articles...');

  const rows = await prisma.extractionResultFlat.findMany({
    where: { source: 'WATCHER' },
    select: { id: true, majorCategory: true, subDivision: true },
  });

  console.log(`📦 Total watcher articles: ${rows.length}`);

  let updated = 0;
  let cleared = 0;
  let notFound = 0;
  let skipped = 0;

  for (const row of rows) {
    const mc = row.majorCategory?.trim() || null;

    if (!mc) {
      // No majorCategory → clear subDivision
      if (row.subDivision !== null && row.subDivision !== '') {
        await prisma.extractionResultFlat.update({
          where: { id: row.id },
          data: { subDivision: null },
        });
        cleared++;
      } else {
        skipped++;
      }
      continue;
    }

    // Look up subDivision from categoryMapping.json
    const mapping = categoryMapping[mc];
    const correctSubDivision = mapping?.sub_division ?? null;

    if (!correctSubDivision) {
      notFound++;
      continue;
    }

    if (row.subDivision !== correctSubDivision) {
      await prisma.extractionResultFlat.update({
        where: { id: row.id },
        data: { subDivision: correctSubDivision },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log('\n📊 Done!');
  console.log(`   Total:    ${rows.length}`);
  console.log(`   Updated:  ${updated}`);
  console.log(`   Cleared:  ${cleared}  (no majorCategory → subDivision set to null)`);
  console.log(`   NotFound: ${notFound}  (majorCategory not in categoryMapping.json)`);
  console.log(`   Skipped:  ${skipped}  (already correct)`);
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
