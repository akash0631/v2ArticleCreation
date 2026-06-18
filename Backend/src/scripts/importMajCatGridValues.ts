/**
 * importMajCatGridValues.ts
 *
 * One-time script: reads ALL_300_GRIDS_SEQUENCED.xlsx and upserts
 * major-category-scoped allowed values into attribute_allowed_values.
 *
 * Run: npx ts-node src/scripts/importMajCatGridValues.ts
 *
 * C1 = FG_MAJ_CAT (major category code)
 * C5 = FATHER COMP MAJ_CAT (attribute display name)
 * C7 = MAIN MVGR (allowed value / short form)
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

// Map Excel C5 display name → master_attributes.id
// Based on active master_attributes in DB
const DISPLAY_TO_ATTR_ID: Record<string, number> = {
  'M_FAB_DIV':           191,
  'M_YARN':              155,
  'FAB_MAIN_MVGR-1':     192,
  'FAB-MAIN-MVGR-2':     157,
  'WEAVE-01':            158,
  'WEAVE 02':            193,
  'M_COUNT':             194,
  'M_GSM':               161,
  'M_OUNZ':              195,
  'M_CONSTRUCTION':      196,
  'M_COMPOSITION':       159,
  'M_FINISH':            160,
  'M_WIDTH':             197,
  'M_LYCRA':             164,
  'M_NECK_TYPE':         165,
  'M_NECK_STYLE':        166,
  'M_COLLAR_TYPE':       167,
  'M_COLLAR_STYLE':      198,
  'M_SLEEVES_MAIN_STYLE':169,
  'M_SLEEVE_FOLD':       199,
  'M_PLACKET':           168,
  'M_BLT_TYPE':          189,
  'M_BLT_STYLE':         190,
  'M_BTM_FOLD':          170,
  'M_POCKET':            172,
  'M_NO_OF_POCKET':      200,
  'M_EXTRA_POCKET':      201,
  'M_LENGTH':            175,
  'M_FIT':               173,
  'BODY STYLE':          174,  // maps to pattern DB field
  'M_DC_STYLE':          176,
  'M_DC_SHAPE':          203,
  'M_ZIP_TYPE':          178,
  'M_ZIP_COL':           179,
  'M_BTN_TYPE':          177,
  'M_BTN_CLR':           204,
  'M_PATCH_STYLE':       184,
  'M_PATCHE_TYPE':       183,
  'M_HTRF_STYLE':        205,
  'M_HTRF_TYPE':         206,
  'M_PRINT_PLACEMENT':   182,
  'M_PRINT_STYLE':       181,
  'M_PRINT_TYPE':        180,
  'M_EMB_TYPE':          185,
  'M_EMBROIDERY_STYLE':  186,
  'M_EMB_PLACEMENT':     207,
  'M_WASH':              187,
  'AGE GROUP':           208,
  'SEGMENT':             212,
  'IMP ATBT':            210,  // M_MAIN_MVGR → imp_atrbt2
};

const EXCEL_PATH = path.resolve('C:/Users/Administrator/Desktop/ALL_300_GRIDS_SEQUENCED.xlsx');
const BATCH_SIZE = 500;

async function main() {
  console.log('Reading Excel...');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.worksheets[0];

  // Collect all rows — use snake_case keys to match jsonb_to_recordset AS clause exactly
  type Row = { attribute_id: number; value: string; major_category: string };
  const rows: Row[] = [];
  let skipped = 0;

  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const c1 = row.getCell(1).value;
    const c5 = row.getCell(5).value;
    const c7 = row.getCell(7).value;

    if (!c1 || !c5 || !c7) continue;

    const major_category = String(c1).trim();
    const displayName    = String(c5).trim();
    const value          = String(c7).trim();

    const attribute_id = DISPLAY_TO_ATTR_ID[displayName];
    if (!attribute_id) {
      skipped++;
      continue;
    }

    rows.push({ attribute_id, value, major_category });
  }

  console.log(`Parsed ${rows.length} rows, skipped ${skipped} (unmapped attributes)`);

  // Remove existing major-category-scoped values (clean re-import)
  console.log('Deleting existing major-category-scoped values...');
  await prisma.$executeRaw`
    DELETE FROM attribute_allowed_values WHERE major_category IS NOT NULL
  `;

  // Batch upsert
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await prisma.$executeRaw`
      INSERT INTO attribute_allowed_values
        (attribute_id, short_form, full_form, major_category, display_order, is_active, created_at, updated_at)
      SELECT
        v.attribute_id,
        v.value,
        v.value,
        v.major_category,
        0,
        true,
        NOW(),
        NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS v(attribute_id int, value text, major_category text)
      ON CONFLICT (attribute_id, short_form, major_category) DO NOTHING
    `;

    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted}/${rows.length}...`);
  }

  console.log(`\nDone! ${inserted} rows processed.`);

  // Verification
  const count = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM attribute_allowed_values WHERE major_category IS NOT NULL
  `;
  console.log(`Verification: ${count[0].count} major-category-scoped rows in DB`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
