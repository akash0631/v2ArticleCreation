/**
 * seed-sap-config.ts
 *
 * Populates SapFieldConfig and SapAttributeValue tables from:
 *   - Hardcoded field mapping (derived from mapping.xlsx)
 *   - maj-cat-attribute-values.json (migrated from frontend data)
 *
 * Run: npx ts-node prisma/seed-sap-config.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ─── Field Config from mapping.xlsx ──────────────────────────────────────────

const FIELD_CONFIGS: Array<{
  section: string;
  uiLabel: string;
  dbField: string;
  sapField: string;
  displayOrder: number;
}> = [
  // FAB
  { section: 'FAB',     uiLabel: 'OTHER MVGR',              dbField: 'macroMvgr',         sapField: 'M_MACRO_MVGR',         displayOrder: 1  },
  { section: 'FAB',     uiLabel: 'F_YARN',                  dbField: 'yarn1',              sapField: 'M_YARN',               displayOrder: 2  },
  { section: 'FAB',     uiLabel: 'F_FABRIC MAIN MVGR-01',   dbField: 'mainMvgr',           sapField: 'M_YARN_02',            displayOrder: 3  },
  { section: 'FAB',     uiLabel: 'F_FABRIC MAIN MVGR-02',   dbField: 'fabricMainMvgr',     sapField: 'M_WEAVE_2',            displayOrder: 4  },
  { section: 'FAB',     uiLabel: 'F_WEAVE_01',              dbField: 'weave',              sapField: 'M_FAB',                displayOrder: 5  },
  { section: 'FAB',     uiLabel: 'F_WEAVE_02',              dbField: 'mFab2',              sapField: 'M_FAB2',               displayOrder: 6  },
  { section: 'FAB',     uiLabel: 'F_COMP',                  dbField: 'composition',        sapField: 'M_COMPOSITION',        displayOrder: 7  },
  { section: 'FAB',     uiLabel: 'F_COUNT',                 dbField: 'fCount',             sapField: 'M_COUNT',              displayOrder: 8  },
  { section: 'FAB',     uiLabel: 'F_CONSTRUCTION',          dbField: 'fConstruction',      sapField: 'M_CONSTRUCTION',       displayOrder: 9  },
  { section: 'FAB',     uiLabel: 'F_STRETCH',               dbField: 'lycra',              sapField: 'M_LYCRA',              displayOrder: 10 },
  { section: 'FAB',     uiLabel: 'F_FINISH',                dbField: 'finish',             sapField: 'M_FINISH',             displayOrder: 11 },
  { section: 'FAB',     uiLabel: 'F_GSM_GLM',               dbField: 'gsm',                sapField: 'M_GSM',                displayOrder: 12 },
  { section: 'FAB',     uiLabel: 'F_OUNCE',                 dbField: 'fOunce',             sapField: 'M_OUNZ',               displayOrder: 13 },
  { section: 'FAB',     uiLabel: 'F_WIDTH',                 dbField: 'fWidth',             sapField: 'M_WIDTH',              displayOrder: 14 },
  { section: 'FAB',     uiLabel: 'SHADE',                   dbField: 'shade',              sapField: 'M_SHADE',              displayOrder: 15 },
  { section: 'FAB',     uiLabel: 'WEIGHT',                  dbField: 'weight',             sapField: 'G_WEIGHT',             displayOrder: 16 },
  { section: 'FAB',     uiLabel: 'M_FAB_DIV',               dbField: 'fabDiv',             sapField: 'M_FAB_DIV',            displayOrder: 17 },
  // BODY
  { section: 'BODY',    uiLabel: 'COLLAR TYPE',             dbField: 'collar',             sapField: 'M_COLLAR',             displayOrder: 17 },
  { section: 'BODY',    uiLabel: 'COLLAR STYLE',            dbField: 'collarStyle',        sapField: 'M_COLLAR_STYLE',       displayOrder: 18 },
  { section: 'BODY',    uiLabel: 'NECK STYLE',              dbField: 'neckDetails',        sapField: 'M_NECK_BAND_STYLE',    displayOrder: 19 },
  { section: 'BODY',    uiLabel: 'NECK TYPE',               dbField: 'neck',               sapField: 'M_NECK_BAND',          displayOrder: 20 },
  { section: 'BODY',    uiLabel: 'PLACKET',                 dbField: 'placket',            sapField: 'M_PLACKET',            displayOrder: 21 },
  { section: 'BODY',    uiLabel: 'BELT',                    dbField: 'fatherBelt',         sapField: 'M_BLT_MAIN_STYLE',     displayOrder: 22 },
  { section: 'BODY',    uiLabel: 'BELT STYLE',              dbField: 'childBelt',          sapField: 'M_SUB_STYLE_BLT',      displayOrder: 23 },
  { section: 'BODY',    uiLabel: 'SLEEVE',                  dbField: 'sleeve',             sapField: 'M_SLEEVES_MAIN_STYLE', displayOrder: 24 },
  { section: 'BODY',    uiLabel: 'SLEEVE FOLD',             dbField: 'sleeveFold',         sapField: 'M_SLEEVE_FOLD',        displayOrder: 25 },
  { section: 'BODY',    uiLabel: 'BOTTOM FOLD',             dbField: 'bottomFold',         sapField: 'M_BTM_FOLD',           displayOrder: 26 },
  { section: 'BODY',    uiLabel: 'FO BTN STYLE',            dbField: 'frontOpenStyle',     sapField: 'M_FO_BTN_STYLE',       displayOrder: 27 },
  { section: 'BODY',    uiLabel: 'NO. OF POCKET',           dbField: 'noOfPocket',         sapField: 'NO_OF_POCKET',         displayOrder: 28 },
  { section: 'BODY',    uiLabel: 'POCKET TYPE',             dbField: 'pocketType',         sapField: 'M_POCKET',             displayOrder: 29 },
  { section: 'BODY',    uiLabel: 'EXTRA POCKET',            dbField: 'extraPocket',        sapField: 'M_EXTRA_POCKET',       displayOrder: 30 },
  // VA ACC
  { section: 'VA_ACC',  uiLabel: 'FIT',                     dbField: 'fit',                sapField: 'M_FIT',                displayOrder: 31 },
  { section: 'VA_ACC',  uiLabel: 'BODY STYLE',              dbField: 'pattern',            sapField: 'M_PATTERN',            displayOrder: 32 },
  { section: 'VA_ACC',  uiLabel: 'LENGTH',                  dbField: 'length',             sapField: 'M_LENGTH',             displayOrder: 33 },
  { section: 'VA_ACC',  uiLabel: 'DC_TYPE',                 dbField: 'drawcord',           sapField: 'M_DC_SUB_STYLE',       displayOrder: 34 },
  { section: 'VA_ACC',  uiLabel: 'DC_SHAPE',                dbField: 'dcShape',            sapField: 'M_DC_SHAPE',           displayOrder: 35 },
  { section: 'VA_ACC',  uiLabel: 'BTN_TYPE',                dbField: 'button',             sapField: 'M_BTN_MAIN_MVGR',      displayOrder: 36 },
  { section: 'VA_ACC',  uiLabel: 'BTN_CLR',                 dbField: 'btnColour',          sapField: 'M_BTN_CLR',            displayOrder: 37 },
  { section: 'VA_ACC',  uiLabel: 'ZIP_TYPE',                dbField: 'zipper',             sapField: 'M_ZIP',                displayOrder: 38 },
  { section: 'VA_ACC',  uiLabel: 'ZIP_CLR',                 dbField: 'zipColour',          sapField: 'M_ZIP_COL',            displayOrder: 39 },
  { section: 'VA_ACC',  uiLabel: 'PATCH_STYLE',             dbField: 'patches',            sapField: 'M_PATCHES',            displayOrder: 40 },
  { section: 'VA_ACC',  uiLabel: 'PATCH_TYPE',              dbField: 'patchesType',        sapField: 'M_PATCH_TYPE',         displayOrder: 41 },
  { section: 'VA_ACC',  uiLabel: 'HTRF_TYPE',               dbField: 'htrfType',           sapField: 'M_HTRF_TYPE',          displayOrder: 42 },
  { section: 'VA_ACC',  uiLabel: 'HTRF_STYLE',              dbField: 'htrfStyle',          sapField: 'M_HTRF_STYLE',         displayOrder: 43 },
  // VA PRCS
  { section: 'VA_PRCS', uiLabel: 'PRT_TYPE',                dbField: 'printType',          sapField: 'M_PRINT_TYPE',         displayOrder: 44 },
  { section: 'VA_PRCS', uiLabel: 'PRT_STYLE',               dbField: 'printStyle',         sapField: 'M_PRINT_STYLE',        displayOrder: 45 },
  { section: 'VA_PRCS', uiLabel: 'PRT_PLACEMENT',           dbField: 'printPlacement',     sapField: 'M_PRINT_PLACEMENT',    displayOrder: 46 },
  { section: 'VA_PRCS', uiLabel: 'EMB_STYLE',               dbField: 'embroidery',         sapField: 'M_EMBROIDERY',         displayOrder: 47 },
  { section: 'VA_PRCS', uiLabel: 'EMB_TYPE',                dbField: 'embroideryType',     sapField: 'M_EMB_TYPE',           displayOrder: 48 },
  { section: 'VA_PRCS', uiLabel: 'EMB_PLACEMENT',           dbField: 'embPlacement',       sapField: 'M_EMB_PLACEMENT',      displayOrder: 49 },
  { section: 'VA_PRCS', uiLabel: 'WASH',                    dbField: 'wash',               sapField: 'M_WASH',               displayOrder: 50 },
  // OTHER
  { section: 'OTHER',   uiLabel: 'AGE GROUP',               dbField: 'ageGroup',           sapField: 'M_AGE_GROUP',          displayOrder: 51 },
  { section: 'OTHER',   uiLabel: 'SEGMENT',                 dbField: 'segment',            sapField: 'Price Band Category',  displayOrder: 52 },
  { section: 'OTHER',   uiLabel: 'ARTICLE FASHION TYPE',    dbField: 'articleFashionType', sapField: 'Fashion Grade',        displayOrder: 53 },
  { section: 'OTHER',   uiLabel: 'MRP',                     dbField: 'mrp',                sapField: 'Mrp ( Char Val)',       displayOrder: 54 },
  { section: 'OTHER',   uiLabel: 'VENDOR-NM',               dbField: 'vendorName',         sapField: 'Vendor',               displayOrder: 55 },
  { section: 'OTHER',   uiLabel: 'ARTICLE WEIGHT',          dbField: 'articleWeight',      sapField: 'Weight (Net)(g)',       displayOrder: 56 },
  { section: 'OTHER',   uiLabel: 'ARTICLE DIMENSION',       dbField: 'articleDimension',   sapField: 'M_ARTICLE_DIMENSION',  displayOrder: 57 },
  { section: 'OTHER',   uiLabel: 'MVGR_BRAND_VENDOR',       dbField: 'mvgrBrandVendor',    sapField: 'MVGR_BRAND_VENDOR',    displayOrder: 58 },
];

// Maps JSON attribute UI labels → dbField
const UI_LABEL_TO_DB_FIELD: Record<string, string> = {
  'OTHER MVGR':            'macroMvgr',
  'F_YARN':                'yarn1',
  'F_FABRIC MAIN MVGR-01': 'mainMvgr',
  'F_FABRIC MAIN MVGR-02': 'fabricMainMvgr',
  'F_WEAVE_01':            'weave',
  'F_WEAVE_02':            'mFab2',
  'F_COMP':                'composition',
  'F_COUNT':               'fCount',
  'F_CONSTRUCTION':        'fConstruction',
  'F_STRETCH':             'lycra',
  'F_FINISH':              'finish',
  'F_GSM_GLM':             'gsm',
  'F_OUNCE':               'fOunce',
  'F_WIDTH':               'fWidth',
  'M_FAB_DIV':             'fabDiv',
  'SHADE':                 'shade',
  'WEIGHT':                'weight',
  'COLLAR TYPE':           'collar',
  'COLLAR STYLE':          'collarStyle',
  'NECK STYLE':            'neckDetails',
  'NECK TYPE':             'neck',
  'PLACKET':               'placket',
  'BELT':                  'fatherBelt',
  'BELT STYLE':            'childBelt',
  'SLEEVE':                'sleeve',
  'SLEEVE FOLD':           'sleeveFold',
  'BOTTOM FOLD':           'bottomFold',
  'FO BTN STYLE':          'frontOpenStyle',
  'NO. OF POCKET':         'noOfPocket',
  'POCKET TYPE':           'pocketType',
  'EXTRA POCKET':          'extraPocket',
  'FIT':                   'fit',
  'BODY STYLE':            'pattern',
  'LENGTH':                'length',
  'DC_TYPE':               'drawcord',
  'DC_SHAPE':              'dcShape',
  'BTN_TYPE':              'button',
  'BTN_CLR':               'btnColour',
  'ZIP_TYPE':              'zipper',
  'ZIP_CLR':               'zipColour',
  'PATCH_STYLE':           'patches',
  'PATCH_TYPE':            'patchesType',
  'HTRF_TYPE':             'htrfType',
  'HTRF_STYLE':            'htrfStyle',
  'PRT_TYPE':              'printType',
  'PRT_STYLE':             'printStyle',
  'PRT_PLACEMENT':         'printPlacement',
  'PRT_PLCMNT':            'printPlacement',
  'EMB_STYLE':             'embroidery',
  'EMB_TYPE':              'embroideryType',
  'EMB_PLACEMENT':         'embPlacement',
  'WASH':                  'wash',
  'AGE GROUP':             'ageGroup',
  'SEGMENT':               'segment',
  'ARTICLE FASHION TYPE':  'articleFashionType',
};

const BATCH_SIZE = 500;

async function main() {
  console.log('Seeding SapFieldConfig...');

  // Upsert all field configs
  const fieldConfigMap = new Map<string, number>(); // dbField → id
  for (const cfg of FIELD_CONFIGS) {
    const record = await prisma.sapFieldConfig.upsert({
      where: { dbField: cfg.dbField },
      update: { section: cfg.section, uiLabel: cfg.uiLabel, sapField: cfg.sapField, displayOrder: cfg.displayOrder },
      create: { section: cfg.section, uiLabel: cfg.uiLabel, dbField: cfg.dbField, sapField: cfg.sapField, displayOrder: cfg.displayOrder },
    });
    fieldConfigMap.set(cfg.dbField, record.id);
  }
  console.log(`  ✓ ${FIELD_CONFIGS.length} field configs upserted`);

  // Load JSON
  const jsonPath = path.join(__dirname, '../../Frontend/src/data/maj-cat-attribute-values.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('  ⚠ JSON file not found, skipping value migration');
    return;
  }

  console.log('Loading JSON (this may take a moment)...');
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Record<string, Record<string, string[]>>;
  console.log(`  ✓ Loaded ${Object.keys(rawData).length} major categories`);

  // Collect all rows to insert
  console.log('Building insert rows...');
  const seen = new Set<string>(); // dedup key
  const rows: Array<{ fieldConfigId: number; value: string; majorCategory: string; displayOrder: number }> = [];

  for (const [majorCategory, attrMap] of Object.entries(rawData)) {
    for (const [uiLabel, values] of Object.entries(attrMap)) {
      const dbField = UI_LABEL_TO_DB_FIELD[uiLabel];
      if (!dbField) continue;
      const fieldConfigId = fieldConfigMap.get(dbField);
      if (!fieldConfigId) continue;
      for (let i = 0; i < values.length; i++) {
        const value = String(values[i]).trim();
        if (!value) continue;
        const key = `${fieldConfigId}|${value}|${majorCategory}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ fieldConfigId, value, majorCategory, displayOrder: i });
      }
    }
  }

  console.log(`  ✓ ${rows.length} unique rows to insert`);

  // Clear existing values and bulk insert
  console.log('Clearing existing values...');
  await prisma.sapAttributeValue.deleteMany({});

  console.log('Bulk inserting in batches...');
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.sapAttributeValue.createMany({ data: batch, skipDuplicates: true });
    inserted += batch.length;
    if (inserted % 10000 === 0) console.log(`  ... ${inserted} / ${rows.length}`);
  }

  console.log(`  ✓ ${inserted} attribute values inserted`);
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
