/**
 * fix-body-style-dbfield.ts
 *
 * One-time fix: rename SapFieldConfig.dbField from 'bodyStyle' → 'pattern'
 * to match the actual ExtractionResultFlat Prisma field name.
 *
 * Run: npx ts-node prisma/fix-body-style-dbfield.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.sapFieldConfig.findFirst({ where: { dbField: 'bodyStyle' } });
  if (!existing) {
    console.log('No SapFieldConfig with dbField="bodyStyle" found — already fixed or never existed.');
    return;
  }

  await prisma.sapFieldConfig.update({
    where: { id: existing.id },
    data: { dbField: 'pattern' },
  });

  console.log(`Updated SapFieldConfig id=${existing.id}: dbField "bodyStyle" → "pattern"`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
