/**
 * fixGlobalAttributeValues.ts
 *
 * Rebuilds the global (major_category = NULL) allowed values for each attribute
 * by taking DISTINCT values across ALL major categories from the Excel.
 * This fixes corrupted/wrong global fallback values (e.g. weave values under M_YARN).
 *
 * Run: npx ts-node src/scripts/fixGlobalAttributeValues.ts
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

// Same map as importMajCatGridValues: Excel C5 display name → attribute_id
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
  'BODY STYLE':          174,
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
  'IMP ATBT':            210,
};

const EXCEL_PATH = path.resolve('C:/Users/Administrator/Desktop/ALL_300_GRIDS_SEQUENCED.xlsx');
const BATCH_SIZE = 500;

async function main() {
  console.log('Reading Excel to collect distinct global values per attribute...');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.worksheets[0];

  // Collect distinct values per attribute_id across ALL major categories
  const distinctValues = new Map<number, Set<string>>();

  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const c5 = row.getCell(5).value;
    const c7 = row.getCell(7).value;

    if (!c5 || !c7) continue;

    const displayName = String(c5).trim();
    const value      = String(c7).trim();
    const attrId     = DISPLAY_TO_ATTR_ID[displayName];
    if (!attrId) continue;

    if (!distinctValues.has(attrId)) distinctValues.set(attrId, new Set());
    distinctValues.get(attrId)!.add(value);
  }

  console.log(`Found ${distinctValues.size} attributes with values`);
  for (const [id, vals] of distinctValues.entries()) {
    console.log(`  attr_id=${id}: ${vals.size} distinct values`);
  }

  // Delete existing global (NULL) values for ONLY the attributes we manage
  const attrIds = Array.from(distinctValues.keys());
  console.log(`\nDeleting existing global values for ${attrIds.length} attributes...`);
  await prisma.$executeRaw`
    DELETE FROM attribute_allowed_values
    WHERE attribute_id = ANY(${attrIds}::int[])
      AND major_category IS NULL
  `;

  // Re-insert global values (DISTINCT across all major categories)
  type Row = { attribute_id: number; value: string };
  const rows: Row[] = [];
  for (const [attribute_id, vals] of distinctValues.entries()) {
    for (const value of vals) {
      rows.push({ attribute_id, value });
    }
  }

  console.log(`Inserting ${rows.length} global rows...`);
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
        NULL,
        0,
        true,
        NOW(),
        NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS v(attribute_id int, value text)
      ON CONFLICT (attribute_id, short_form, major_category) DO NOTHING
    `;
    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted}/${rows.length}...`);
  }

  console.log(`\nDone! Global values rebuilt.`);

  // Verification
  const count = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM attribute_allowed_values WHERE major_category IS NULL
  `;
  console.log(`Verification: ${count[0].count} global rows in DB`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
