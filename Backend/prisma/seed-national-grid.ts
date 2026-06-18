/**
 * seed-national-grid.ts
 *
 * Extracts attribute values from NATIONAL_GRID_REVISED Excel and seeds DB.
 * Only values with DIV column = 1 (active) are included per division.
 * DIV empty / null / 0 = inactive → excluded from dropdowns.
 *
 * Run: npx ts-node prisma/seed-national-grid.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Mapping from National Grid Excel column header → DB dbField name
// Some Excel headers differ from the SAP field names stored in SapFieldConfig.
// ---------------------------------------------------------------------------
const EXCEL_HEADER_TO_DBFIELD: Record<string, string | null> = {
  'M_YARN':               'yarn1',
  'FAB_MAIN_MVGR-1':      'mainMvgr',
  'FAB-MAIN-MVGR-2':      'fabricMainMvgr',
  'WEAVE 01':             'weave',
  'WEAVE 02':             'mFab2',
  'M_COUNT':              'fCount',
  'M_GSM':                'gsm',
  'M_OUNZ':               'fOunce',
  'M_CONSTRUCTION':       'fConstruction',
  'M_COMPOSITION':        'composition',
  'M_FINISH':             'finish',
  'M_WIDTH':              'fWidth',
  'M_LYCRA':              'lycra',
  'M_NECK_BAND':          'neck',
  'M_NECK_BAND_STYLE':    'neckDetails',
  'M_COLLAR':             'collar',
  'M_COLLAR_STYLE':       'collarStyle',
  'M_SLEEVES_MAIN_STYLE': 'sleeve',
  'M_SLEEVE_FOLD':        'sleeveFold',
  'M_PLACKET':            'placket',
  'M_BLT_MAIN_STYLE':     'fatherBelt',
  'M_BTM_FOLD':           'bottomFold',
  'M_POCKET':             'pocketType',
  'M_NO_OF_POCKET':       'noOfPocket',
  'M_EXTRA_POCKET':       'extraPocket',
  'M_LENGTH':             'length',
  'M_FIT':                'fit',
  'BODY STYLE':           'bodyStyle',
  'M_DC_SUB_STYLE':       'drawcord',
  'M_DC_SHAPE':           'dcShape',
  'M_ZIP':                'zipper',
  'M_ZIP_COL':            'zipColour',
  'M_BTN_MAIN_MVGR':      'button',
  'M_BTN_CLR':            'btnColour',
  'M_PATCH_TYPE':         'patchesType',
  'M_PATCHES':            'patches',
  'M_HTRF_STYLE':         'htrfStyle',
  'M_HTRF_TYPE':          'htrfType',
  'M_PRINT_PLACEMENT':    'printPlacement',
  'M_PRINT_STYLE':        'printStyle',
  'M_PRINT_TYPE':         'printType',
  'M_EMB_TYPE':           'embroideryType',
  'M_EMBROIDERY':         'embroidery',
  'M_EMB_PLACEMENT':      'embPlacement',
  'M_WASH':               'wash',
  'M_MACRO_MVGR':         'macroMvgr',
  'M_MAIN_MVGR':          'impAtrbt2',
};

const DIVISIONS = ['MENS', 'LADIES', 'KIDS'] as const;
const BATCH_SIZE = 500;

const EXCEL_PATH = path.join(
  'C:/Users/Administrator/Downloads',
  'NATIONAL_GRID_REVISED V3 (1).xlsx',
);

const prisma = new PrismaClient();

function extractDivisionValues(
  rawRows: unknown[][],
  division: string,
): Array<{ dbField: string; value: string; order: number }> {
  // Row indices (0-based):
  //   0 → title row
  //   1 → column numbers
  //   2 → field headers  (M_YARN | FAB_MAIN_MVGR-1 | ...)
  //   3 → ACT/IN-ACT labels
  //   4+ → data rows
  const headerRow = rawRows[2] as (string | undefined)[];
  const results: Array<{ dbField: string; value: string; order: number }> = [];
  const seen = new Set<string>();

  // Columns come in triplets: [FIELD_NAME, VALUE, DIV]
  for (let col = 0; col < headerRow.length; col += 3) {
    const excelHeader = headerRow[col];
    if (!excelHeader) continue;

    const dbField = EXCEL_HEADER_TO_DBFIELD[excelHeader];
    if (dbField === undefined) {
      console.warn(`  ⚠ [${division}] Unknown Excel header: "${excelHeader}" — skipping`);
      continue;
    }
    if (dbField === null) continue; // intentionally unmapped

    let order = 0;
    for (let row = 4; row < rawRows.length; row++) {
      const dataRow = rawRows[row] as unknown[];
      const rawVal = dataRow[col + 1];
      const divFlag = dataRow[col + 2];

      if (rawVal === undefined || rawVal === null || rawVal === '') continue;

      // Only include rows where DIV column is exactly 1
      if (divFlag !== 1) continue;

      const value = String(rawVal).trim();
      if (!value) continue;

      const key = `${dbField}|${value}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ dbField, value, order: order++ });
    }
  }

  return results;
}

async function main() {
  // Lazy-require xlsx so the script can run without it being in package.json devDeps
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx') as typeof import('xlsx');

  if (!require('fs').existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found at: ${EXCEL_PATH}`);
  }

  const wb = XLSX.readFile(EXCEL_PATH);

  // Load fieldConfig id map: dbField → id
  const configs = await prisma.sapFieldConfig.findMany({ select: { id: true, dbField: true } });
  const fieldMap = new Map(configs.map((c) => [c.dbField, c.id]));
  console.log(`Loaded ${fieldMap.size} field configs.`);

  // Clear existing division-scoped values
  const deleted = await prisma.sapAttributeValue.deleteMany({
    where: { majorCategory: { in: [...DIVISIONS] } },
  });
  console.log(`Cleared ${deleted.count} existing division values.`);

  let totalInserted = 0;

  for (const division of DIVISIONS) {
    const sheet = wb.Sheets[division];
    if (!sheet) {
      console.warn(`Sheet "${division}" not found in workbook — skipping`);
      continue;
    }

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const entries = extractDivisionValues(rawRows, division);

    const rows: Array<{
      fieldConfigId: number;
      value: string;
      majorCategory: string;
      displayOrder: number;
    }> = [];

    for (const { dbField, value, order } of entries) {
      const fieldConfigId = fieldMap.get(dbField);
      if (!fieldConfigId) {
        console.warn(`  ⚠ [${division}] No fieldConfig for dbField: "${dbField}"`);
        continue;
      }
      rows.push({ fieldConfigId, value, majorCategory: division, displayOrder: order });
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await prisma.sapAttributeValue.createMany({
        data: rows.slice(i, i + BATCH_SIZE),
        skipDuplicates: true,
      });
    }

    console.log(`  ✓ ${division}: ${rows.length} active values inserted`);
    totalInserted += rows.length;
  }

  console.log(`\nDone. Total: ${totalInserted} values inserted.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
