/**
 * Seed script: populate hierarchy DB with all current hardcoded data.
 * Safe to run multiple times (uses upsert/skipDuplicates).
 * Run from Backend/: npx ts-node scripts/seedHierarchy.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient, GarmentType, AttributeType } from '../src/generated/prisma';

const prisma = new PrismaClient();

// ─── Data ────────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  { code: 'KIDS',   name: 'Kids',   displayOrder: 1 },
  { code: 'LADIES', name: 'Ladies', displayOrder: 2 },
  { code: 'MENS',   name: 'MENS',   displayOrder: 3 },
];

// subDepartmentCode → { name, departmentCode, displayOrder }
const SUB_DEPARTMENTS: Record<string, { name: string; departmentCode: string; displayOrder: number }> = {
  'KB':         { name: 'Kids Boys',             departmentCode: 'KIDS',   displayOrder: 1 },
  'KBW':        { name: 'Kids Boys Winter',       departmentCode: 'KIDS',   displayOrder: 2 },
  'KG':         { name: 'Kids Girls',             departmentCode: 'KIDS',   displayOrder: 3 },
  'KGW':        { name: 'Kids Girls Winter',      departmentCode: 'KIDS',   displayOrder: 4 },
  'INFANT':     { name: 'Infant',                 departmentCode: 'KIDS',   displayOrder: 5 },
  'K_INNER':    { name: 'Kids Innerwear',         departmentCode: 'KIDS',   displayOrder: 6 },
  'L_UPPER':    { name: 'Ladies Upper',           departmentCode: 'LADIES', displayOrder: 1 },
  'L_LOWER':    { name: 'Ladies Lower',           departmentCode: 'LADIES', displayOrder: 2 },
  'L_SETS':     { name: 'Ladies Sets',            departmentCode: 'LADIES', displayOrder: 3 },
  'L_WINTER':   { name: 'Ladies Winter',          departmentCode: 'LADIES', displayOrder: 4 },
  'M_UPPER':    { name: 'Mens Upper',             departmentCode: 'MENS',   displayOrder: 1 },
  'M_SETS':     { name: 'Mens Sets',              departmentCode: 'MENS',   displayOrder: 2 },
  'M_WINTER':   { name: 'Mens Winter',            departmentCode: 'MENS',   displayOrder: 3 },
  'M_LOWER':    { name: 'Mens Lower',             departmentCode: 'MENS',   displayOrder: 4 },
  'M_OTHERS':   { name: 'Mens Others',            departmentCode: 'MENS',   displayOrder: 5 },
};

// category code → { name, subDeptCode, garmentType, displayOrder }
const CATEGORIES: {
  code: string; name: string; subDeptCode: string;
  garmentType: GarmentType; displayOrder: number;
}[] = [
  // Kids Boys
  { code: 'KB-SETS', name: 'Kids Boys Sets',          subDeptCode: 'KB',      garmentType: GarmentType.ALL_IN_ONE, displayOrder: 1 },
  { code: 'KB-L',    name: 'Kids Boys Lower',          subDeptCode: 'KB',      garmentType: GarmentType.LOWER,      displayOrder: 2 },
  { code: 'KB-U',    name: 'Kids Boys Upper',          subDeptCode: 'KB',      garmentType: GarmentType.UPPER,      displayOrder: 3 },
  { code: 'KB',      name: 'Kids Boys General',        subDeptCode: 'KB',      garmentType: GarmentType.UPPER,      displayOrder: 4 },
  // Kids Boys Winter
  { code: 'KBW-U',   name: 'Kids Boys Winter Upper',   subDeptCode: 'KBW',     garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'KBW-L',   name: 'Kids Boys Winter Lower',   subDeptCode: 'KBW',     garmentType: GarmentType.LOWER,      displayOrder: 2 },
  { code: 'KBW-SETS',name: 'Kids Boys Winter Sets',    subDeptCode: 'KBW',     garmentType: GarmentType.ALL_IN_ONE, displayOrder: 3 },
  { code: 'KBW',     name: 'Kids Boys Winter General', subDeptCode: 'KBW',     garmentType: GarmentType.UPPER,      displayOrder: 4 },
  // Kids Girls
  { code: 'KG-L',    name: 'Kids Girls Lower',         subDeptCode: 'KG',      garmentType: GarmentType.LOWER,      displayOrder: 1 },
  { code: 'KG-U',    name: 'Kids Girls Upper',         subDeptCode: 'KG',      garmentType: GarmentType.UPPER,      displayOrder: 2 },
  { code: 'KG',      name: 'Kids Girls General',       subDeptCode: 'KG',      garmentType: GarmentType.UPPER,      displayOrder: 3 },
  // Kids Girls Winter
  { code: 'KGW-U',   name: 'Kids Girls Winter Upper',  subDeptCode: 'KGW',     garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'KGW-L',   name: 'Kids Girls Winter Lower',  subDeptCode: 'KGW',     garmentType: GarmentType.LOWER,      displayOrder: 2 },
  // Infant
  { code: 'IB',      name: 'Infant Boys',              subDeptCode: 'INFANT',  garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'IG',      name: 'Infant Girls',             subDeptCode: 'INFANT',  garmentType: GarmentType.UPPER,      displayOrder: 2 },
  // Kids Innerwear
  { code: 'KI',      name: 'Kids Innerwear',           subDeptCode: 'K_INNER', garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'KIW',     name: 'Kids Innerwear Winter',    subDeptCode: 'K_INNER', garmentType: GarmentType.UPPER,      displayOrder: 2 },
  // Ladies
  { code: 'LU',      name: 'Ladies Upper',             subDeptCode: 'L_UPPER', garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'LL',      name: 'Ladies Lower',             subDeptCode: 'L_LOWER', garmentType: GarmentType.LOWER,      displayOrder: 1 },
  { code: 'LK&L',    name: 'Ladies Kurti & Legging',   subDeptCode: 'L_SETS',  garmentType: GarmentType.ALL_IN_ONE, displayOrder: 1 },
  { code: 'LN&L',    name: 'Ladies Night & Lounge',    subDeptCode: 'L_SETS',  garmentType: GarmentType.ALL_IN_ONE, displayOrder: 2 },
  { code: 'LW',      name: 'Ladies Winter',            subDeptCode: 'L_WINTER',garmentType: GarmentType.UPPER,      displayOrder: 1 },
  // Mens
  { code: 'MU',      name: 'Mens Upper',               subDeptCode: 'M_UPPER', garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'MS-U',    name: 'Mens Sets Upper',          subDeptCode: 'M_SETS',  garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'MS-L',    name: 'Mens Sets Lower',          subDeptCode: 'M_SETS',  garmentType: GarmentType.LOWER,      displayOrder: 2 },
  { code: 'MS-IW',   name: 'Mens Sets Innerwear',      subDeptCode: 'M_SETS',  garmentType: GarmentType.UPPER,      displayOrder: 3 },
  { code: 'MW',      name: 'Mens Winter',              subDeptCode: 'M_WINTER',garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'MO',      name: 'Mens Others',              subDeptCode: 'M_OTHERS',garmentType: GarmentType.UPPER,      displayOrder: 1 },
  { code: 'ML',      name: 'Mens Lower',               subDeptCode: 'M_LOWER', garmentType: GarmentType.LOWER,      displayOrder: 1 },
];

// Attributes — confidence stored as 0.xx (Prisma Decimal)
const MASTER_ATTRIBUTES: {
  key: string; label: string; type: AttributeType;
  confidenceThreshold: number; displayOrder: number; aiExtractable: boolean;
}[] = [
  { key: 'division',                    label: 'Division',                    type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 1,  aiExtractable: true },
  { key: 'major_category',              label: 'Major Category',              type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 2,  aiExtractable: true },
  { key: 'reference_article_number',    label: 'Reference Article Number',    type: AttributeType.TEXT, confidenceThreshold: 0,    displayOrder: 3,  aiExtractable: true },
  { key: 'reference_article_description',label:'Reference Article Description',type: AttributeType.TEXT,confidenceThreshold: 0,    displayOrder: 4,  aiExtractable: true },
  { key: 'vendor_name',                 label: 'Vendor Name',                 type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 5,  aiExtractable: true },
  { key: 'design_number',               label: 'Design Number',               type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 6,  aiExtractable: true },
  { key: 'ppt_number',                  label: 'PPT Number',                  type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 7,  aiExtractable: true },
  { key: 'rate',                        label: 'Rate/Price',                  type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 8,  aiExtractable: true },
  { key: 'size',                        label: 'Size',                        type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 9,  aiExtractable: true },
  { key: 'yarn_01',                     label: 'Yarn 1',                      type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 10, aiExtractable: true },
  { key: 'yarn_02',                     label: 'Yarn 2',                      type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 11, aiExtractable: true },
  { key: 'fabric_main_mvgr',            label: 'Fabric Main MVGR',            type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 12, aiExtractable: true },
  { key: 'weave',                       label: 'Weave',                       type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 13, aiExtractable: true },
  { key: 'composition',                 label: 'Composition',                 type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 14, aiExtractable: true },
  { key: 'finish',                      label: 'Finish',                      type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 15, aiExtractable: true },
  { key: 'gsm',                         label: 'GSM',                         type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 16, aiExtractable: true },
  { key: 'shade',                       label: 'Shade',                       type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 17, aiExtractable: true },
  { key: 'weight',                      label: 'G-Weight',                    type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 18, aiExtractable: true },
  { key: 'lycra_non_lycra',             label: 'Lycra/Non Lycra',             type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 19, aiExtractable: true },
  { key: 'neck',                        label: 'Neck',                        type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 20, aiExtractable: true },
  { key: 'neck_details',                label: 'Neck Details',                type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 21, aiExtractable: true },
  { key: 'collar',                      label: 'Collar',                      type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 22, aiExtractable: true },
  { key: 'placket',                     label: 'Placket',                     type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 23, aiExtractable: true },
  { key: 'sleeve',                      label: 'Sleeve',                      type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 24, aiExtractable: true },
  { key: 'bottom_fold',                 label: 'Bottom Fold',                 type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 25, aiExtractable: true },
  { key: 'front_open_style',            label: 'Front Open Style',            type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 26, aiExtractable: true },
  { key: 'pocket_type',                 label: 'Pocket Type',                 type: AttributeType.TEXT, confidenceThreshold: 0.50, displayOrder: 27, aiExtractable: true },
  { key: 'fit',                         label: 'Fit',                         type: AttributeType.TEXT, confidenceThreshold: 0.50, displayOrder: 28, aiExtractable: true },
  { key: 'pattern',                     label: 'Pattern',                     type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 29, aiExtractable: true },
  { key: 'length',                      label: 'Length',                      type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 30, aiExtractable: true },
  { key: 'drawcord',                    label: 'Drawcord',                    type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 31, aiExtractable: true },
  { key: 'button',                      label: 'Button',                      type: AttributeType.TEXT, confidenceThreshold: 0.50, displayOrder: 32, aiExtractable: true },
  { key: 'zipper',                      label: 'Zipper',                      type: AttributeType.TEXT, confidenceThreshold: 0.50, displayOrder: 33, aiExtractable: true },
  { key: 'zip_colour',                  label: 'Zip Colour',                  type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 34, aiExtractable: true },
  { key: 'print_type',                  label: 'Print Type',                  type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 35, aiExtractable: true },
  { key: 'print_style',                 label: 'Print Style',                 type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 36, aiExtractable: true },
  { key: 'print_placement',             label: 'Print Placement',             type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 37, aiExtractable: true },
  { key: 'patches',                     label: 'Patches',                     type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 38, aiExtractable: true },
  { key: 'patches_type',               label: 'Patches Type',                type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 39, aiExtractable: true },
  { key: 'embroidery',                  label: 'Embroidery',                  type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 40, aiExtractable: true },
  { key: 'embroidery_type',             label: 'Embroidery Type',             type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 41, aiExtractable: true },
  { key: 'wash',                        label: 'Wash',                        type: AttributeType.TEXT, confidenceThreshold: 0.50, displayOrder: 42, aiExtractable: true },
  { key: 'colour',                      label: 'Colour',                      type: AttributeType.TEXT, confidenceThreshold: 0.50, displayOrder: 43, aiExtractable: true },
  { key: 'father_belt',                 label: 'Father Belt',                 type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 44, aiExtractable: true },
  { key: 'child_belt',                  label: 'Child Belt',                  type: AttributeType.TEXT, confidenceThreshold: 0.65, displayOrder: 45, aiExtractable: true },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding hierarchy...');

  // 1. Departments
  console.log('  → Upserting departments...');
  const deptMap: Record<string, number> = {};
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { code: d.code },
      create: { code: d.code, name: d.name, displayOrder: d.displayOrder },
      update: { name: d.name, displayOrder: d.displayOrder },
    });
    deptMap[d.code] = row.id;
  }
  console.log(`     ✓ ${Object.keys(deptMap).length} departments`);

  // 2. Sub-departments
  console.log('  → Upserting sub-departments...');
  const subDeptMap: Record<string, number> = {};
  for (const [code, sd] of Object.entries(SUB_DEPARTMENTS)) {
    const departmentId = deptMap[sd.departmentCode];
    const row = await prisma.subDepartment.upsert({
      where: { departmentId_code: { departmentId, code } },
      create: { code, name: sd.name, departmentId, displayOrder: sd.displayOrder },
      update: { name: sd.name, displayOrder: sd.displayOrder },
    });
    subDeptMap[code] = row.id;
  }
  console.log(`     ✓ ${Object.keys(subDeptMap).length} sub-departments`);

  // 3. Categories
  console.log('  → Upserting categories...');
  const categoryMap: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    const subDepartmentId = subDeptMap[cat.subDeptCode];
    const row = await prisma.category.upsert({
      where: { code: cat.code },
      create: {
        code: cat.code,
        name: cat.name,
        subDepartmentId,
        garmentType: cat.garmentType,
        displayOrder: cat.displayOrder,
      },
      update: {
        name: cat.name,
        subDepartmentId,
        garmentType: cat.garmentType,
        displayOrder: cat.displayOrder,
      },
    });
    categoryMap[cat.code] = row.id;
  }
  console.log(`     ✓ ${Object.keys(categoryMap).length} categories`);

  // 4. Master attributes
  console.log('  → Upserting master attributes...');
  const attrMap: Record<string, number> = {};
  for (const attr of MASTER_ATTRIBUTES) {
    const row = await prisma.masterAttribute.upsert({
      where: { key: attr.key },
      create: {
        key: attr.key,
        label: attr.label,
        type: attr.type,
        confidenceThreshold: attr.confidenceThreshold,
        displayOrder: attr.displayOrder,
        aiExtractable: attr.aiExtractable,
        isActive: true,
      },
      update: {
        label: attr.label,
        type: attr.type,
        confidenceThreshold: attr.confidenceThreshold,
        displayOrder: attr.displayOrder,
        aiExtractable: attr.aiExtractable,
      },
    });
    attrMap[attr.key] = row.id;
  }
  console.log(`     ✓ ${Object.keys(attrMap).length} master attributes`);

  // 5. Category-attribute mappings (all attrs enabled for all categories)
  console.log('  → Upserting category-attribute mappings...');
  let mappingCount = 0;
  for (const [catCode, categoryId] of Object.entries(categoryMap)) {
    for (const [attrKey, attributeId] of Object.entries(attrMap)) {
      await prisma.categoryAttribute.upsert({
        where: { categoryId_attributeId: { categoryId, attributeId } },
        create: {
          categoryId,
          attributeId,
          isEnabled: true,
          isRequired: false,
          displayOrder: MASTER_ATTRIBUTES.find(a => a.key === attrKey)?.displayOrder ?? 0,
        },
        update: {},
      });
      mappingCount++;
    }
  }
  console.log(`     ✓ ${mappingCount} category-attribute mappings`);

  console.log('✅ Hierarchy seed complete!');
}

seed()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
