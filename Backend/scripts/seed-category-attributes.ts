/**
 * seed-category-attributes.ts
 *
 * Uses maj-cat-mandatory.json to populate CategoryAttribute rows for every
 * category defined in the JSON.
 *
 * Rules:
 *   - Attribute appears in JSON for that category → isEnabled=true, isRequired=true
 *   - Attribute does NOT appear                   → isEnabled=false, isRequired=false
 *
 * Strategy (fast):
 *   1. Build the full desired state in memory
 *   2. DELETE all existing CategoryAttribute rows for affected categories
 *   3. INSERT all rows in batches of 500 via createMany
 *
 * Run: npx ts-node scripts/seed-category-attributes.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import * as path from 'path';

const prisma = new PrismaClient();

const BATCH_SIZE = 500;

// ─── SAP name → schema key ─────────────────────────────────────────────────

const SAP_TO_KEY: Record<string, string> = {
  M_MACRO_MVGR:          'macro_mvgr',
  M_YARN:                'yarn_01',
  'M_YARN-02':           'main_mvgr',
  M_YARN_02:             'main_mvgr',
  M_WEAVE_2:             'fabric_main_mvgr',
  M_FAB:                 'weave',
  M_FAB2:                'm_fab2',
  M_COMPOSITION:         'composition',
  M_COUNT:               'f_count',
  M_CONSTRUCTION:        'f_construction',
  M_LYCRA:               'lycra_non_lycra',
  M_FINISH:              'finish',
  M_GSM:                 'gsm',
  M_OUNZ:                'f_ounce',
  M_WIDTH:               'f_width',
  M_UOM:                 'f_uom',
  M_COLLAR_TYPE:         'collar',
  M_COLLAR:              'collar',
  M_COLLAR_STYLE:        'collar_style',
  M_NECK_TYPE:           'neck',
  M_NECK_BAND:           'neck',
  M_NECK_STYLE:          'neck_details',
  M_NECK_BAND_STYLE:     'neck_details',
  M_PLACKET:             'placket',
  M_BLT_TYPE:            'father_belt',
  M_BLT_MAIN_STYLE:      'father_belt',
  M_BLT_STYLE:           'child_belt',
  M_SUB_STYLE_BLT:       'child_belt',
  M_SLEEVES_MAIN_STYLE:  'sleeve',
  M_SLEEVE_FOLD:         'sleeve_fold',
  M_BTM_FOLD:            'bottom_fold',
  NO_OF_POCKET:          'no_of_pocket',
  M_NO_OF_POCKET:        'no_of_pocket',
  M_POCKET:              'pocket_type',
  M_EXTRA_POCKET:        'extra_pocket',
  M_FIT:                 'fit',
  M_PATTERN:             'body_style',
  M_LENGTH:              'length',
  M_DC_STYLE:            'drawcord',
  M_DC_SUB_STYLE:        'drawcord',
  M_DC_SHAPE:            'dc_shape',
  M_BTN_TYPE:            'button',
  M_BTN_MAIN_MVGR:       'button',
  M_BTN_CLR:             'btn_colour',
  M_ZIP_TYPE:            'zipper',
  M_ZIP:                 'zipper',
  M_ZIP_COL:             'zip_colour',
  M_PATCH_STYLE:         'patches_type',
  M_PATCHE_TYPE:         'patches',
  M_PATCHES:             'patches',
  M_PATCH_TYPE:          'patches_type',
  M_HTRF_TYPE:           'htrf_type',
  M_HTRF_STYLE:          'htrf_style',
  M_PRINT_TYPE:          'print_type',
  M_PRINT_STYLE:         'print_style',
  M_PRINT_PLACEMENT:     'print_placement',
  M_EMB_TYPE:            'embroidery',
  M_EMBROIDERY_STYLE:    'embroidery_type',
  M_EMBROIDERY:          'embroidery',
  M_EMB_PLACEMENT:       'emb_placement',
  M_WASH:                'wash',
  M_AGE_GROUP:           'age_group',
  M_SHADE:               'shade',
  M_FO_BTN_STYLE:        'front_open_style',
  M_ARTICLE_DIMENSION:   'article_dimension',
  'Price Band Category': 'segment',
  'Fashion Grade':       'article_fashion_type',
  'Cost':                'rate',
  'Mrp ( Char Val)':     'mrp',
  'Vendor':              'vendor_name',
  'Weight (Net)(g)':     'weight',
};

// ─── Load mandatory JSON ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mandatoryData: Record<string, string[]> = require(
  path.join(__dirname, '../../Frontend/src/data/maj-cat-mandatory.json'),
);

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const jsonCats = Object.keys(mandatoryData);
  console.log(`📖 ${jsonCats.length} categories in JSON\n`);

  // 1. Load all active MasterAttributes
  const allAttrs = await prisma.masterAttribute.findMany({
    where: { isActive: true },
    select: { id: true, key: true },
  });
  const attrByKey = new Map(allAttrs.map(a => [a.key, a.id]));
  console.log(`   MasterAttributes: ${allAttrs.length}`);

  // 2. Load categories that exist in DB (only those also in the JSON)
  const dbCategories = await prisma.category.findMany({
    where: { code: { in: jsonCats } },
    select: { id: true, code: true },
  });
  const catByCode = new Map(dbCategories.map(c => [c.code, c.id]));
  console.log(`   Categories found in DB: ${dbCategories.length} / ${jsonCats.length}`);

  const missingInDb = jsonCats.filter(c => !catByCode.has(c));
  if (missingInDb.length) {
    console.log(`   ⚠  Not in DB (skipping): ${missingInDb.join(', ')}`);
  }

  // 3. Build full desired state in memory
  const rows: { categoryId: number; attributeId: number; isEnabled: boolean; isRequired: boolean }[] = [];
  const unknownSap = new Set<string>();

  for (const [catCode, sapNames] of Object.entries(mandatoryData)) {
    const categoryId = catByCode.get(catCode);
    if (!categoryId) continue;

    // SAP names → schema keys for this category
    const enabledKeys = new Set<string>();
    for (const sap of sapNames) {
      const key = SAP_TO_KEY[sap];
      if (key) enabledKeys.add(key);
      else unknownSap.add(sap);
    }

    // One row per attribute
    for (const attr of allAttrs) {
      const isEnabled  = enabledKeys.has(attr.key);
      rows.push({ categoryId, attributeId: attr.id, isEnabled, isRequired: isEnabled });
    }
  }

  console.log(`\n   Rows to write: ${rows.length}`);

  // 4. Delete existing rows for affected categories (single query)
  const affectedCatIds = dbCategories.map(c => c.id);
  const { count: deleted } = await prisma.categoryAttribute.deleteMany({
    where: { categoryId: { in: affectedCatIds } },
  });
  console.log(`   Deleted old rows: ${deleted}`);

  // Deduplicate rows by (categoryId, attributeId) just in case
  const seen = new Set<string>();
  const uniqueRows = rows.filter(r => {
    const k = `${r.categoryId}_${r.attributeId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(`   Unique rows     : ${uniqueRows.length} (${rows.length - uniqueRows.length} dupes removed)`);

  // 5. Insert all rows in batches of BATCH_SIZE
  let inserted = 0;
  for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
    const batch = uniqueRows.slice(i, i + BATCH_SIZE);
    await prisma.categoryAttribute.createMany({ data: batch, skipDuplicates: true });
    inserted += batch.length;
    process.stdout.write(`\r   Inserted: ${inserted} / ${uniqueRows.length}`);
  }
  console.log(); // newline after progress

  console.log(`\n✅ Done.`);
  console.log(`   Categories processed: ${dbCategories.length}`);
  console.log(`   Rows inserted       : ${inserted} / ${uniqueRows.length}`);

  if (unknownSap.size > 0) {
    console.log(`\n⚠  SAP names with no schema key mapping:`);
    for (const n of unknownSap) console.log(`     "${n}"`);
  }
}

main()
  .catch(err => { console.error('❌ Error:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
