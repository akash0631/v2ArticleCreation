/**
 * seed-fab-div-attribute.ts
 *
 * 1. Upserts MasterAttribute for fab_div (M_FAB_DIV, FAB group, SELECT type)
 * 2. Enables + marks required on all MEN, Ladies, Kids categories
 * 3. Upserts SapFieldConfig + SapAttributeValue allowed values for fab_div
 *
 * Run: npx ts-node prisma/seed-fab-div-attribute.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const FAB_DIV_VALUES = ['K', 'W', 'DNM', 'RFD_K', 'RFD_W'];
const TARGET_DIVISIONS = ['MEN', 'LADIES', 'KIDS'];

async function main() {
  // ── 1. Upsert MasterAttribute ──────────────────────────────────────────────
  const attr = await prisma.masterAttribute.upsert({
    where: { key: 'fab_div' },
    create: {
      key:              'fab_div',
      label:            'M_FAB_DIV',
      type:             'SELECT',
      group:            'FAB',
      isActive:         true,
      aiExtractable:    true,
      displayOrder:     999,
    },
    update: {
      label:         'M_FAB_DIV',
      group:         'FAB',
      isActive:      true,
      aiExtractable: true,
    },
  });
  console.log(`MasterAttribute upserted: id=${attr.id}, key=${attr.key}`);

  // ── 2. Upsert allowed values for the MasterAttribute ──────────────────────
  for (const val of FAB_DIV_VALUES) {
    await prisma.attributeAllowedValue.upsert({
      where: { attributeId_shortForm: { attributeId: attr.id, shortForm: val } },
      create: { attributeId: attr.id, shortForm: val, fullForm: val, isActive: true, displayOrder: FAB_DIV_VALUES.indexOf(val) + 1 },
      update: { fullForm: val, isActive: true },
    });
  }
  console.log(`Allowed values seeded: ${FAB_DIV_VALUES.join(', ')}`);

  // ── 3. Find all categories in MEN / Ladies / Kids departments ─────────────
  const departments = await prisma.department.findMany({
    where: { name: { in: TARGET_DIVISIONS, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  console.log(`Departments found: ${departments.map(d => d.name).join(', ')}`);

  const subDepts = await prisma.subDepartment.findMany({
    where: { departmentId: { in: departments.map(d => d.id) } },
    select: { id: true },
  });

  const categories = await prisma.category.findMany({
    where: { subDepartmentId: { in: subDepts.map(s => s.id) } },
    select: { id: true, code: true },
  });
  console.log(`Categories found: ${categories.length}`);

  // ── 4. Upsert CategoryAttribute (enabled + required) for each category ────
  let upserted = 0;
  for (const cat of categories) {
    await prisma.categoryAttribute.upsert({
      where: { categoryId_attributeId: { categoryId: cat.id, attributeId: attr.id } },
      create: {
        categoryId:   cat.id,
        attributeId:  attr.id,
        isEnabled:    true,
        isRequired:   true,
        displayOrder: 999,
      },
      update: {
        isEnabled:  true,
        isRequired: true,
      },
    });
    upserted++;
  }
  console.log(`CategoryAttribute upserted for ${upserted} categories`);

  // ── 5. Upsert SapFieldConfig ──────────────────────────────────────────────
  const existingConfig = await prisma.sapFieldConfig.findFirst({ where: { dbField: 'fabDiv' } });
  if (!existingConfig) {
    await prisma.sapFieldConfig.create({
      data: {
        section:      'FAB',
        uiLabel:      'M_FAB_DIV',
        dbField:      'fabDiv',
        sapField:     'M_FAB_DIV',
        isActive:     true,
        displayOrder: 17,
      },
    });
    console.log('SapFieldConfig created for fabDiv');
  } else {
    console.log('SapFieldConfig already exists for fabDiv');
  }

  // ── 6. Upsert SapAttributeValue for MENS / LADIES / KIDS ─────────────────
  const config = await prisma.sapFieldConfig.findFirst({ where: { dbField: 'fabDiv' } });
  if (config) {
    for (const div of ['MENS', 'LADIES', 'KIDS']) {
      for (const val of FAB_DIV_VALUES) {
        await prisma.sapAttributeValue.upsert({
          where: { fieldConfigId_value_majorCategory: { fieldConfigId: config.id, value: val, majorCategory: div } },
          create: { fieldConfigId: config.id, value: val, majorCategory: div, isActive: true },
          update: { isActive: true },
        });
      }
    }
    console.log('SapAttributeValue upserted for MENS, LADIES, KIDS');
  }

  console.log('\nDone!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
