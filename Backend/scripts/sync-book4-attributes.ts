/**
 * Sync attribute allowed values from Book4.xlsx into the database.
 * Replaces all existing allowed values for each mapped attribute.
 *
 * Usage:
 *   npx ts-node scripts/sync-book4-attributes.ts
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import { prismaClient as prisma } from '../src/utils/prisma';

const EXCEL_PATH = path.resolve(__dirname, '..', '..', 'Book4.xlsx');

// Maps (0-based column index in Book4.xlsx) -> master_attribute.key
// Each pair: col[i] = shortForm, col[i+1] = fullForm
const COL_MAP: Record<number, string> = {
  4:  'YARN_01',
  6:  'FABRIC_MAIN_MVGR',
  8:  'WEAVE',
  10: 'WEAVE_2',
  12: 'COMPOSITION',
  14: 'FINISH',
  16: 'CONSTRUCTION',
  18: 'GRAM_PER_SQUARE_METER',
  20: 'COUNT',
  22: 'OUNCE',
  24: 'SHADE',
  26: 'LYCRA',        // M_LYCRA
  30: 'NECK',         // M_NECK_BAND_STYLE
  32: 'NECK_DETAIL',  // M_NECK_BAND
  34: 'PLACKET',
  36: 'FATHER_BELT',
  38: 'CHILD_BELT_DETAIL',
  40: 'SLEEVE',
  42: 'BOTTOM_FOLD',
  44: 'FRONT_OPEN_STYLE',
  48: 'POCKET_TYPE',
  52: 'FIT',
  54: 'PATTERN',
  56: 'LENGTH',
  58: 'DRAWCORD',
  60: 'BUTTON',
  62: 'ZIPPER',
  64: 'ZIP_COLOUR',
  66: 'PRINT_TYPE',
  68: 'PRINT_PLACEMENT',
  70: 'PRINT_STYLE',
  72: 'PATCHES',
  74: 'PATCH_TYPE',
  76: 'EMBROIDERY',
  78: 'EMBROIDERY_TYPE',
  80: 'WASH',
  84: 'COLOR',
  92: 'YARN_02',
};

function collectValues(rows: string[][], col: number): { shortForm: string; fullForm: string }[] {
  const seen = new Set<string>();
  const values: { shortForm: string; fullForm: string }[] = [];
  for (let r = 1; r < rows.length; r++) {
    const sf = String(rows[r][col] ?? '').trim();
    const ff = String(rows[r][col + 1] ?? '').trim();
    if (!sf) continue;
    const key = `${sf}|${ff}`;
    if (!seen.has(key)) {
      seen.add(key);
      values.push({ shortForm: sf, fullForm: ff || sf });
    }
  }
  return values;
}

async function main() {
  console.log('📂 Reading Book4.xlsx from:', EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][];
  console.log(`✅ Loaded ${rows.length} rows\n`);

  // Load all master attributes from DB (key -> id), handle keys with whitespace
  const dbAttributes = await prisma.masterAttribute.findMany({ select: { id: true, key: true } });
  const keyToId = new Map<string, number>();
  for (const a of dbAttributes) {
    // Normalize key (strip newlines/spaces that may exist as data bugs)
    const normalized = a.key.replace(/[\n\r\s]+/g, '_').trim();
    keyToId.set(a.key, a.id);
    keyToId.set(normalized, a.id);
  }

  let totalUpdated = 0;

  for (const [colStr, attrKey] of Object.entries(COL_MAP)) {
    const col = parseInt(colStr, 10);
    const values = collectValues(rows, col);

    // Try exact key first, then with LYCRA special-case
    let attrId = keyToId.get(attrKey);

    // LYCRA key in DB has a newline bug — try fuzzy match
    if (!attrId && attrKey === 'LYCRA') {
      for (const [dbKey, id] of keyToId.entries()) {
        if (dbKey.includes('LYCRA')) { attrId = id; break; }
      }
    }

    if (!attrId) {
      console.log(`⚠️  Attribute not found in DB, skipping: ${attrKey}`);
      continue;
    }

    if (values.length === 0) {
      console.log(`⚠️  No values found in Excel for: ${attrKey}`);
      continue;
    }

    // Replace allowed values: delete existing, insert new
    const deleted = await prisma.attributeAllowedValue.deleteMany({ where: { attributeId: attrId } });
    await prisma.attributeAllowedValue.createMany({
      data: values.map((v, i) => ({
        attributeId: attrId as number,
        shortForm: v.shortForm,
        fullForm: v.fullForm,
        aliases: [],
        isActive: true,
        displayOrder: i,
      })),
      skipDuplicates: true,
    });

    console.log(`✅ ${attrKey}: removed ${deleted.count}, inserted ${values.length} values`);
    totalUpdated++;
  }

  console.log(`\n🎉 Done. Updated ${totalUpdated} attributes in the database.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
