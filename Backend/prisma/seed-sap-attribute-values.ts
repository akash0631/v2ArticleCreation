/**
 * seed-sap-attribute-values.ts
 *
 * Refreshes sap_attribute_value from the approved Excel grid.
 * - Deletes ALL existing rows first
 * - Inserts unique values from all 3 sheets (MENS / LADIES / KIDS)
 * - No majorCategory scope (NULL = applies to all divisions)
 *
 * Run: npx ts-node prisma/seed-sap-attribute-values.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import * as path from 'path';

// Adjust path if the Excel lives somewhere else
const EXCEL_PATH = path.resolve(
  'C:/Users/Administrator/Desktop/FINAL GRID APPROVED-NEW - Copy.xlsx',
);

const SHEETS = ['BASE_HORIZONTAL ', 'BASE_HORIZONTAL -LADIES', 'BASE_HORIZONTAL -KIDS'];

// Row 3 (index 2) uses these headers in the Excel — map them to the sapField
// stored in sap_field_config so we can look up the correct fieldConfigId.
// Excel key → sap_field_config.sap_field
const EXCEL_TO_SAP_FIELD: Record<string, string> = {
  'M_FAB_DIV':            'M_FAB_DIV',
  'M_YARN':               'M_YARN',
  'M_YARN-02':            'M_YARN_02',    // Excel uses hyphen, DB uses underscore
  'M_WEAVE_2':            'M_WEAVE_2',
  'M_FAB':                'M_FAB',
  'M_FAB2':               'M_FAB2',
  'M_COUNT':              'M_COUNT',
  'M_GSM':                'M_GSM',
  'M_OUNZ':               'M_OUNZ',
  'M_CONSTRUCTION':       'M_CONSTRUCTION',
  'M_COMPOSITION':        'M_COMPOSITION',
  'M_FINISH':             'M_FINISH',
  'M_WIDTH':              'M_WIDTH',
  'M_LYCRA':              'M_LYCRA',
  'M_NECK_BAND':          'M_NECK_BAND',
  'M_NECK_BAND_STYLE':    'M_NECK_BAND_STYLE',
  'M_COLLAR':             'M_COLLAR',
  'M_COLLAR_STYLE':       'M_COLLAR_STYLE',
  'M_SLEEVES_MAIN_STYLE': 'M_SLEEVES_MAIN_STYLE',
  'M_SLEEVE_FOLD':        'M_SLEEVE_FOLD',
  'M_PLACKET':            'M_PLACKET',
  'M_BLT_MAIN_STYLE':     'M_BLT_MAIN_STYLE',
  'M_SUB_STYLE_BLT':      'M_SUB_STYLE_BLT',
  'M_BTM_FOLD':           'M_BTM_FOLD',
  'M_POCKET':             'M_POCKET',
  'M_NO_OF_POCKET':       'M_NO_OF_POCKET',
  'M_EXTRA_POCKET':       'M_EXTRA_POCKET',
  'M_LENGTH':             'M_LENGTH',
  'M_FIT':                'M_FIT',
  'M_PATTERN':            'M_PATTERN',
  'M_DC_SUB_STYLE':       'M_DC_SUB_STYLE',
  'M_DC_SHAPE':           'M_DC_SHAPE',
  'M_ZIP':                'M_ZIP',
  'M_ZIP_COL':            'M_ZIP_COL',
  'M_BTN_MAIN_MVGR':      'M_BTN_MAIN_MVGR',
  'M_BTN_CLR':            'M_BTN_CLR',
  'M_PATCH_TYPE':         'M_PATCH_TYPE',
  'M_PATCHES':            'M_PATCHES',
  'M_HTRF_STYLE':         'M_HTRF_STYLE',
  'M_HTRF_TYPE':          'M_HTRF_TYPE',
  'M_PRINT_PLACEMENT':    'M_PRINT_PLACEMENT',
  'M_PRINT_STYLE':        'M_PRINT_STYLE',
  'M_PRINT_TYPE':         'M_PRINT_TYPE',
  'M_EMB_TYPE':           'M_EMB_TYPE',
  'M_EMBROIDERY':         'M_EMBROIDERY',
  'M_EMB_PLACEMENT':      'M_EMB_PLACEMENT',
  'M_WASH':               'M_WASH',
  'AGE GROUP':            'M_AGE_GROUP',  // Excel label differs from sapField
  'M_MAIN_MVGR':          'M_MAIN_MVGR',
};

const BATCH_SIZE = 500;
const prisma = new PrismaClient();

async function main() {
  // Lazy-load xlsx so it only needs to be installed in Backend
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx') as typeof import('xlsx');

  console.log(`Reading Excel: ${EXCEL_PATH}`);
  const wb = XLSX.readFile(EXCEL_PATH);

  // ── 1. Collect unique values per sapField across all sheets ──────────────
  // Map: sapField → Set<value>
  const valuesBySapField = new Map<string, Set<string>>();

  for (const sheetName of SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.warn(`  ⚠ Sheet not found: "${sheetName}" — skipping`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(ws, {
      header: 1,
      defval: null,
    });

    // Row index 2 = row 3 in Excel (SAP field names)
    const headerRow = rows[2] as (string | null)[];
    if (!headerRow) { console.warn(`  ⚠ No header row in ${sheetName}`); continue; }

    // Data starts at row index 5 (row 6 in Excel)
    for (let r = 5; r < rows.length; r++) {
      const row = rows[r] as (string | null)[];
      if (!row || row.every(c => c === null)) continue;

      // Columns come in pairs: [fieldName, value, fieldName, value, ...]
      for (let c = 0; c < headerRow.length; c += 2) {
        const excelKey = headerRow[c];
        const cellVal = row[c + 1];
        if (!excelKey || !cellVal) continue;

        const sapField = EXCEL_TO_SAP_FIELD[excelKey];
        if (!sapField) continue; // unmapped column — skip

        const val = String(cellVal).trim();
        if (!val) continue;

        if (!valuesBySapField.has(sapField)) valuesBySapField.set(sapField, new Set());
        valuesBySapField.get(sapField)!.add(val);
      }
    }

    console.log(`  ✓ Processed sheet: ${sheetName}`);
  }

  console.log(`\nFound values for ${valuesBySapField.size} SAP fields`);

  // ── 2. Load sap_field_config → build sapField → id map ──────────────────
  const fieldConfigs = await prisma.sapFieldConfig.findMany({
    select: { id: true, sapField: true },
  });
  const sapFieldToId = new Map<string, number>(
    fieldConfigs.map(fc => [fc.sapField, fc.id]),
  );
  console.log(`Loaded ${fieldConfigs.length} field configs from DB`);

  // ── 3. Build insert rows ─────────────────────────────────────────────────
  const rows: Array<{ fieldConfigId: number; value: string; majorCategory: null; displayOrder: number }> = [];

  for (const [sapField, values] of valuesBySapField) {
    const fieldConfigId = sapFieldToId.get(sapField);
    if (!fieldConfigId) {
      console.warn(`  ⚠ No sap_field_config found for sapField="${sapField}" — skipping`);
      continue;
    }
    let order = 0;
    for (const val of values) {
      rows.push({ fieldConfigId, value: val, majorCategory: null, displayOrder: order++ });
    }
  }

  console.log(`\nPrepared ${rows.length} rows to insert`);

  // ── 4. Delete old values ─────────────────────────────────────────────────
  console.log('Deleting all existing sap_attribute_value rows...');
  const { count: deleted } = await prisma.sapAttributeValue.deleteMany({});
  console.log(`  ✓ Deleted ${deleted} rows`);

  // ── 5. Bulk insert ───────────────────────────────────────────────────────
  console.log('Inserting new values in batches...');
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.sapAttributeValue.createMany({ data: batch, skipDuplicates: true });
    inserted += batch.length;
  }

  console.log(`  ✓ Inserted ${inserted} rows`);

  // ── 6. Summary ───────────────────────────────────────────────────────────
  console.log('\n════ Summary ════');
  for (const [sapField, values] of valuesBySapField) {
    const id = sapFieldToId.get(sapField);
    if (id) console.log(`  ${sapField.padEnd(25)} ${values.size} values`);
  }
  console.log('\nDone! Restart the backend to clear the in-memory cache.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
