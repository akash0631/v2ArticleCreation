/**
 * seed-master-attributes-from-grid.ts
 *
 * Seeds MasterAttribute + AttributeAllowedValue from the National Grid Excel.
 * - Row 3  = RFC name (used as lookup key)
 * - Row 4  = Display label (shown on article card)
 * - Row 5+ = Allowed values (from the VALUE column next to each attribute)
 *
 * Run: npx ts-node scripts/seed-master-attributes-from-grid.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import * as ExcelJS from 'exceljs';
import * as path from 'path';

const prisma = new PrismaClient();

const EXCEL_PATH = path.join(
  'C:/Users/Administrator/Desktop',
  'NATIONAL_GRID_REVISED VRTC V6 GAURAV SIR ARUN SIR AS ON 5 MAY-FINAL VL.xlsx',
);

const SHEET_NAME = 'BASE_HORIZONTAL -MENS';

// RFC name (row 3) → schema key used as MasterAttribute.key
const RFC_TO_SCHEMA_KEY: Record<string, string> = {
  'M_FAB_DIV':           'fab_div',
  'M_YARN':              'yarn_01',
  'M_YARN-02':           'main_mvgr',
  'M_WEAVE_2':           'fabric_main_mvgr',
  'M_FAB':               'weave',
  'M_FAB2':              'm_fab2',
  'M_COUNT':             'f_count',
  'M_GSM':               'gsm',
  'M_OUNZ':              'f_ounce',
  'M_CONSTRUCTION':      'f_construction',
  'M_COMPOSITION':       'composition',
  'M_FINISH':            'finish',
  'M_WIDTH':             'f_width',
  'M_LYCRA':             'lycra_non_lycra',
  'M_NECK_BAND':         'neck',
  'M_NECK_BAND_STYLE':   'neck_details',
  'M_COLLAR':            'collar',
  'M_COLLAR_STYLE':      'collar_style',
  'M_SLEEVES_MAIN_STYLE':'sleeve',
  'M_SLEEVE_FOLD':       'sleeve_fold',
  'M_PLACKET':           'placket',
  'M_BLT_MAIN_STYLE':    'father_belt',
  'M_SUB_STYLE_BLT':     'child_belt',
  'M_BTM_FOLD':          'bottom_fold',
  'M_POCKET':            'pocket_type',
  'M_NO_OF_POCKET':      'no_of_pocket',
  'M_EXTRA_POCKET':      'extra_pocket',
  'M_LENGTH':            'length',
  'M_FIT':               'fit',
  'M_PATTERN':           'body_style',
  'M_DC_SUB_STYLE':      'drawcord',
  'M_DC_SHAPE':          'dc_shape',
  'M_ZIP':               'zipper',
  'M_ZIP_COL':           'zip_colour',
  'M_BTN_MAIN_MVGR':     'button',
  'M_BTN_CLR':           'btn_colour',
  'M_PATCH_TYPE':        'patches_type',
  'M_PATCHES':           'patches',
  'M_HTRF_STYLE':        'htrf_style',
  'M_HTRF_TYPE':         'htrf_type',
  'M_PRINT_PLACEMENT':   'print_placement',
  'M_PRINT_STYLE':       'print_style',
  'M_PRINT_TYPE':        'print_type',
  'M_EMB_TYPE':          'embroidery',
  'M_EMBROIDERY':        'embroidery_type',
  'M_EMB_PLACEMENT':     'emb_placement',
  'M_WASH':              'wash',
  'AGE GROUP':           'age_group',
  'M_MACRO_MVGR':        'macro_mvgr',
  'M_MAIN_MVGR':         'imp_atrbt2',
};

function getCellValue(row: ExcelJS.Row, col: number): string | null {
  const cell = row.getCell(col);
  const v = cell.value;
  if (!v) return null;
  if (typeof v === 'object' && 'result' in v) return v.result ? String(v.result).trim() : null;
  if (typeof v === 'object' && 'text' in v) return v.text ? String(v.text).trim() : null;
  return String(v).trim() || null;
}

interface AttributeData {
  rfc: string;
  schemaKey: string;
  label: string;
  values: string[];
}

async function extractAttributes(): Promise<AttributeData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  const row3 = sheet.getRow(3);
  const row4 = sheet.getRow(4);
  const maxRow = sheet.rowCount;
  const attributes: AttributeData[] = [];

  // Attribute columns are odd (1,3,5,...), value columns are the next even column
  for (let c = 1; c <= sheet.columnCount; c += 2) {
    const rfc = getCellValue(row3, c);
    if (!rfc || rfc === 'VALUE' || rfc === 'FULL FORM') continue;

    const schemaKey = RFC_TO_SCHEMA_KEY[rfc];
    if (!schemaKey) {
      console.warn(`  ⚠ No schema key mapping for RFC "${rfc}" — skipping`);
      continue;
    }

    const label = getCellValue(row4, c) || rfc;

    // Collect unique values from the VALUE column (c+1), rows 5+
    const seen = new Set<string>();
    const values: string[] = [];
    for (let r = 5; r <= maxRow; r++) {
      const v = getCellValue(sheet.getRow(r), c + 1);
      if (v && v !== '-' && !seen.has(v)) {
        seen.add(v);
        values.push(v);
      }
    }

    attributes.push({ rfc, schemaKey, label, values });
  }

  return attributes;
}

async function main() {
  console.log('📖 Reading Excel...');
  const attributes = await extractAttributes();
  console.log(`   Found ${attributes.length} attributes\n`);

  let attrCreated = 0;
  let attrUpdated = 0;
  let valCreated = 0;

  for (const attr of attributes) {
    // Upsert the MasterAttribute
    const existing = await prisma.masterAttribute.findUnique({ where: { key: attr.schemaKey } });

    let attributeId: number;
    if (existing) {
      await prisma.masterAttribute.update({
        where: { key: attr.schemaKey },
        data: { label: attr.label, isActive: true },
      });
      attributeId = existing.id;
      attrUpdated++;
    } else {
      const created = await prisma.masterAttribute.create({
        data: {
          key: attr.schemaKey,
          label: attr.label,
          type: 'SELECT',
          isActive: true,
          isRequired: true,
          displayOrder: 0,
        },
      });
      attributeId = created.id;
      attrCreated++;
    }

    // Upsert allowed values
    for (let i = 0; i < attr.values.length; i++) {
      const shortForm = attr.values[i];
      await prisma.attributeAllowedValue.upsert({
        where: { attributeId_shortForm: { attributeId, shortForm } },
        create: {
          attributeId,
          shortForm,
          fullForm: shortForm,
          isActive: true,
          displayOrder: i,
        },
        update: {
          isActive: true,
          displayOrder: i,
        },
      });
      valCreated++;
    }

    console.log(`  ✅ ${attr.schemaKey} (${attr.label}) — ${attr.values.length} values`);
  }

  console.log(`\n✅ Done.`);
  console.log(`   Attributes created : ${attrCreated}`);
  console.log(`   Attributes updated : ${attrUpdated}`);
  console.log(`   Values upserted    : ${valCreated}`);
}

main()
  .catch(err => { console.error('❌ Error:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
