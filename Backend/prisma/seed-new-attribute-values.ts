/**
 * Seed new allowed values for existing master attributes:
 *   - MAIN_MVGR  : PYJAMA, SHARARA, PANT, PLAZO
 *   - WEAVE      : 8_SNGL, NS_TRY, TERRY, LNCR, CHN_TWL, POKA, OUTLNDR, SKIN_PU, ML_TPU, CORD
 *   - M_PATTERN  : O_ELS, I_ELS
 *   - M_PRINT_STYLE : PLK_PRT
 *   - M_EMBROIDERY  : NK_PIP, NK_FRL
 *   - M_FAB2     : LED
 *   - major_category : M_RNCT (Mens Raincoat, MS-L, MC 114070101, HSN 620342)
 *
 * Adds missing entries only — does NOT delete existing values.
 * Run: npx ts-node --project tsconfig.json prisma/seed-new-attribute-values.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────────────────────
// Static data to insert
// ──────────────────────────────────────────────────────────────────────────────

const NEW_VALUES: Record<string, { shortForm: string; fullForm: string }[]> = {
  MAIN_MVGR: [
    { shortForm: 'PYJAMA',   fullForm: 'PYJAMA' },
    { shortForm: 'SHARARA',  fullForm: 'SHARARA' },
    { shortForm: 'PANT',     fullForm: 'PANT' },
    { shortForm: 'PLAZO',    fullForm: 'PLAZO' },
  ],

  WEAVE: [
    { shortForm: '8_SNGL',  fullForm: '8 SINGLE' },
    { shortForm: 'NS_TRY',  fullForm: 'NS TERRY' },
    { shortForm: 'TERRY',   fullForm: 'TERRY' },
    { shortForm: 'LNCR',    fullForm: 'LANCER' },
    { shortForm: 'CHN_TWL', fullForm: 'CHINA TWILL' },
    { shortForm: 'POKA',    fullForm: 'POKA' },
    { shortForm: 'OUTLNDR', fullForm: 'OUTLANDER' },
    { shortForm: 'SKIN_PU', fullForm: 'SKIN PU' },
    { shortForm: 'ML_TPU',  fullForm: 'MALAI TUP' },
    { shortForm: 'CORD',    fullForm: 'CORDURORY' },
  ],

  PATTERN: [
    { shortForm: 'O_ELS', fullForm: 'OUTER ELASTIC' },
    { shortForm: 'I_ELS', fullForm: 'INNER ELASTIC' },
  ],

  PRINT_STYLE: [
    { shortForm: 'PLK_PRT', fullForm: 'POLKA PRINT' },
  ],

  EMBROIDERY: [
    { shortForm: 'NK_PIP', fullForm: 'NECK PIPPING' },
    { shortForm: 'NK_FRL', fullForm: 'NECK FRILL' },
  ],

  M_FAB2: [
    { shortForm: 'LED', fullForm: 'LED' },
  ],
};

// ──────────────────────────────────────────────────────────────────────────────

async function seedAttribute(
  key: string,
  values: { shortForm: string; fullForm: string }[]
) {
  // 1. Find the master attribute
  const attr = await prisma.masterAttribute.findFirst({ where: { key } });
  if (!attr) {
    console.warn(`⚠️  Master attribute '${key}' not found — skipping.`);
    return;
  }

  console.log(`\n🔑 ${key} (id=${attr.id})`);

  // 2. Fetch existing shortForms (normalised)
  const existing = await prisma.attributeAllowedValue.findMany({
    where: { attributeId: attr.id },
    select: { shortForm: true },
  });
  const existingSet = new Set(existing.map((v) => v.shortForm.trim().toUpperCase()));

  // 3. Filter to only new values
  const toInsert = values.filter(
    (v) => !existingSet.has(v.shortForm.trim().toUpperCase())
  );

  if (toInsert.length === 0) {
    console.log(`   ✅ All values already present — nothing to insert.`);
    return;
  }

  // 4. Get current max displayOrder
  const maxRow = await prisma.attributeAllowedValue.findFirst({
    where: { attributeId: attr.id },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  });
  let nextOrder = (maxRow?.displayOrder ?? -1) + 1;

  // 5. Insert
  const insertData = toInsert.map((v) => ({
    attributeId: attr.id,
    shortForm: v.shortForm.trim(),
    fullForm: v.fullForm.trim(),
    displayOrder: nextOrder++,
    isActive: true,
  }));

  const result = await prisma.attributeAllowedValue.createMany({
    data: insertData,
    skipDuplicates: true,
  });

  console.log(`   ➕ Inserted ${result.count} new value(s):`);
  toInsert.forEach((v) =>
    console.log(`      ${v.shortForm.padEnd(12)} → ${v.fullForm}`)
  );

  const total = await prisma.attributeAllowedValue.count({
    where: { attributeId: attr.id },
  });
  console.log(`   📊 Total values for ${key} after seed: ${total}`);
}

// New major categories to add (keeps aliases for mcCode / division / subDivision lookups)
const NEW_MAJOR_CATEGORIES = [
  { name: 'M_RNCT', mcCode: '114070101', division: 'MENS', subDivision: 'MS-L' },
];

async function seedMajorCategories(
  entries: Array<{ name: string; mcCode: string; division: string; subDivision: string }>
) {
  const attr = await prisma.masterAttribute.findFirst({ where: { key: 'major_category' } });
  if (!attr) {
    console.warn(`⚠️  Master attribute 'major_category' not found — skipping.`);
    return;
  }
  console.log(`\n🔑 major_category (id=${attr.id})`);

  const existing = await prisma.attributeAllowedValue.findMany({
    where: { attributeId: attr.id },
    select: { shortForm: true },
  });
  const existingSet = new Set(existing.map((v) => v.shortForm.trim().toUpperCase()));

  const toInsert = entries.filter((e) => !existingSet.has(e.name.trim().toUpperCase()));
  if (toInsert.length === 0) {
    console.log(`   ✅ All major category values already present — nothing to insert.`);
    return;
  }

  const maxRow = await prisma.attributeAllowedValue.findFirst({
    where: { attributeId: attr.id },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  });
  let nextOrder = (maxRow?.displayOrder ?? -1) + 1;

  const result = await prisma.attributeAllowedValue.createMany({
    data: toInsert.map((e) => ({
      attributeId: attr.id,
      shortForm: e.name,
      fullForm: e.name,
      aliases: [e.mcCode, e.division, e.subDivision],
      displayOrder: nextOrder++,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  console.log(`   ➕ Inserted ${result.count} new major category value(s):`);
  toInsert.forEach((e) =>
    console.log(`      ${e.name.padEnd(14)} MC: ${e.mcCode}  ${e.division} / ${e.subDivision}`)
  );
}

async function main() {
  console.log('🌱 Seeding new attribute values...\n');

  for (const [key, values] of Object.entries(NEW_VALUES)) {
    await seedAttribute(key, values);
  }

  await seedMajorCategories(NEW_MAJOR_CATEGORIES);

  console.log('\n✅ Done.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
