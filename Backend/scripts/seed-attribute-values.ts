/**
 * seed-attribute-values.ts
 *
 * Replaces all attribute values in the DB with values from the national grid Excel.
 * For each field+division: deletes ALL existing values, then inserts from Excel.
 * Safe to re-run — result is always exactly what the Excel defines.
 *
 * Run: npx ts-node scripts/seed-attribute-values.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const dataFile = path.join(__dirname, '../src/data/sap-attribute-values.json');
const allValues: Record<string, Record<string, string[]>> = JSON.parse(
  fs.readFileSync(dataFile, 'utf-8')
);

const DIVISIONS = ['MENS', 'LADIES', 'KIDS'];

async function main() {
  const fieldConfigs = await prisma.sapFieldConfig.findMany({
    select: { id: true, dbField: true },
  });
  const dbFieldToId = new Map(fieldConfigs.map(f => [f.dbField, f.id]));

  console.log(`Loaded ${fieldConfigs.length} field configs from DB.\n`);

  let totalDeleted = 0;
  let totalInserted = 0;

  for (const division of DIVISIONS) {
    console.log(`── ${division} ──`);
    const fieldMap = allValues[division] ?? allValues['MENS'] ?? {};

    for (const [dbField, newValues] of Object.entries(fieldMap)) {
      const fieldConfigId = dbFieldToId.get(dbField);
      if (!fieldConfigId) {
        console.warn(`  [SKIP] No SapFieldConfig for dbField="${dbField}"`);
        continue;
      }

      // 1. Delete ALL existing values for this field + division
      const { count: deleted } = await prisma.sapAttributeValue.deleteMany({
        where: { fieldConfigId, majorCategory: division },
      });

      // 2. Insert fresh values from Excel in order
      await prisma.sapAttributeValue.createMany({
        data: newValues.map((value, i) => ({
          fieldConfigId,
          value,
          majorCategory: division,
          displayOrder: i + 1,
          isActive: true,
        })),
        skipDuplicates: true,
      });

      console.log(`  ${dbField}: deleted ${deleted}, inserted ${newValues.length}`);
      totalDeleted += deleted;
      totalInserted += newValues.length;
    }
    console.log();
  }

  console.log(`Done. Total deleted: ${totalDeleted} | Total inserted: ${totalInserted}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
