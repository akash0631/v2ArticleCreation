import { prismaClient as prisma } from '../src/utils/prisma';
import fs from 'fs';
import path from 'path';

type ColumnRow = {
  column_name: string;
  raw_value: string;
};

type MasterAttribute = {
  id: number;
  key: string;
  label: string;
};

const INSERT_CHUNK_SIZE = parseInt(process.env.EXCEL_TO_ATTR_CHUNK_SIZE || '1000', 10);
const EXCEL_MAP_PATH = process.env.EXCEL_MAP_PATH || path.resolve(__dirname, '..', '..', 'excelmap.json');

const SAP_COLUMN_TO_ATTRIBUTE_KEY: Record<string, string> = {
  M_YARN: 'YARN_01',
  M_YARN_02: 'YARN_02',
  M_MAIN_MVGR: 'FABRIC_MAIN_MVGR',
  M_FAB: 'FABRIC_MAIN_MVGR',
  M_WEAVE_1: 'WEAVE',
  M_COMPOSITION: 'COMPOSITION',
  M_FINISH: 'FINISH',
  M_GSM: 'GRAM_PER_SQUARE_METER',
  M_FAB_WEIGHT: 'GRAM_PER_SQUARE_METER',
  M_SHADE: 'SHADE',
  M_LYCRA: 'LYCRA_NON_LYCRA',
  M_NECK_BAND: 'NECK',
  M_COLLAR: 'COLLAR',
  M_PLACKET: 'PLACKET',
  M_SLEEVES_MAIN_STYLE: 'SLEEVE',
  M_BTM_FOLD: 'BOTTOM_FOLD',
  M_FO_BTN_STYLE: 'FRONT_OPEN_STYLE',
  M_POCKET: 'POCKET_TYPE',
  M_FIT: 'FIT',
  M_PATTERN: 'PATTERN',
  M_LENGTH: 'LENGTH',
  M_DC_EDGE_LOOP: 'DRAWCORD',
  M_BTN_MAIN_MVGR: 'BUTTON',
  M_ZIP: 'ZIPPER',
  M_ZIP_COL: 'ZIP_COLOUR',
  M_PRINT_TYPE: 'PRINT_TYPE',
  M_PRINT_STYLE: 'PRINT_STYLE',
  M_PRINT_PLACEMENT: 'PRINT_PLACEMENT',
  M_PLACEMENT: 'PRINT_PLACEMENT',
  M_PATCHES: 'PATCHES',
  M_PATCH_TYPE: 'PATCH_TYPE',
  M_EMBROIDERY: 'EMBROIDERY',
  M_EMB_TYPE: 'EMBROIDERY_TYPE',
  M_WASH: 'WASH'
};

const ATTRIBUTE_KEY_ALIASES: Record<string, string> = {
  yarn1: 'YARN_01',
  yarn01: 'YARN_01',
  yarn2: 'YARN_02',
  yarn02: 'YARN_02',
  gsm: 'GRAM_PER_SQUARE_METER',
  lycra: 'LYCRA_NON_LYCRA',
  neckdetails: 'NECK_DETAIL',
  patchestype: 'PATCH_TYPE',
  colour: 'COLOR',
  mc_code: 'MC_CODE',
  mccode: 'MC_CODE'
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

type ExcelMapItem = {
  Attributes?: string;
  Column3?: string;
  Column4?: string;
};

function readExcelMapItems(): ExcelMapItem[] {
  if (!fs.existsSync(EXCEL_MAP_PATH)) {
    return [];
  }

  const raw = fs.readFileSync(EXCEL_MAP_PATH, 'utf-8').trim();
  if (!raw) return [];

  // Supports both valid JSON array and loose object-list JSON used in this workspace.
  const asArrayText = raw.startsWith('[') ? raw : `[${raw}]`;
  const parsed = JSON.parse(asArrayText);
  return Array.isArray(parsed) ? parsed : [];
}

function resolveAttributeToken(token: string): string {
  const n = normalize(token);
  const alias = ATTRIBUTE_KEY_ALIASES[n];
  return alias || token;
}

function buildExcelMapLookup(): Map<string, string> {
  const items = readExcelMapItems();
  const lookup = new Map<string, string>();

  for (const item of items) {
    const attributeToken = (item.Attributes || '').trim();
    const target = attributeToken ? resolveAttributeToken(attributeToken) : '';
    if (!target) continue;

    const srcColumns = [item.Column3, item.Column4]
      .map((x) => String(x || '').trim())
      .filter(Boolean);

    for (const src of srcColumns) {
      lookup.set(normalize(src), target);
    }

    // Also allow direct attribute-name match from Excel column.
    lookup.set(normalize(attributeToken), target);
  }

  return lookup;
}

function resolveAttributeForColumn(
  columnName: string,
  byKey: Map<string, MasterAttribute>,
  byNormKey: Map<string, MasterAttribute>,
  byNormLabel: Map<string, MasterAttribute>,
  excelMapLookup: Map<string, string>
): { attr: MasterAttribute | null; mappedBy: string } {
  const normalized = normalize(columnName);
  const noPrefixNormalized = normalize(columnName.replace(/^M_/, ''));

  const excelMapTarget = excelMapLookup.get(normalized) || excelMapLookup.get(noPrefixNormalized);
  if (excelMapTarget) {
    const viaMap =
      byKey.get(excelMapTarget.toLowerCase()) ||
      byNormKey.get(normalize(excelMapTarget)) ||
      byNormLabel.get(normalize(excelMapTarget)) ||
      null;
    if (viaMap) {
      return { attr: viaMap, mappedBy: 'excelmap' };
    }
  }

  const explicit = SAP_COLUMN_TO_ATTRIBUTE_KEY[columnName] || SAP_COLUMN_TO_ATTRIBUTE_KEY[columnName.toUpperCase()];
  if (explicit) {
    const viaExplicit = byKey.get(explicit.toLowerCase()) || byNormKey.get(normalize(explicit)) || null;
    if (viaExplicit) {
      return { attr: viaExplicit, mappedBy: 'sap-explicit' };
    }
  }

  const keyExact = byKey.get(columnName.toLowerCase());
  if (keyExact) return { attr: keyExact, mappedBy: 'key-exact' };

  const keyNorm = byNormKey.get(normalized) || byNormKey.get(noPrefixNormalized);
  if (keyNorm) return { attr: keyNorm, mappedBy: 'key-normalized' };

  const labelNorm = byNormLabel.get(normalized) || byNormLabel.get(noPrefixNormalized);
  if (labelNorm) return { attr: labelNorm, mappedBy: 'label-normalized' };

  return { attr: null, mappedBy: 'unmapped' };
}

async function ensureMappingTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS excel_column_attribute_mapping (
      id BIGSERIAL PRIMARY KEY,
      column_name VARCHAR(255) NOT NULL UNIQUE,
      normalized_column VARCHAR(255) NOT NULL,
      attribute_id INT NULL,
      attribute_key VARCHAR(100) NULL,
      attribute_label VARCHAR(200) NULL,
      mapped_by VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_excel_col_map_attr ON excel_column_attribute_mapping(attribute_id);
  `);
}

async function main(): Promise<void> {
  await ensureMappingTable();
  const excelMapLookup = buildExcelMapLookup();

  const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    'SELECT DISTINCT column_name FROM excel_attribute_values ORDER BY column_name'
  );

  if (!columns.length) {
    console.log('ℹ️ No rows in excel_attribute_values to map.');
    return;
  }

  const masterAttributes = await prisma.masterAttribute.findMany({
    where: { isActive: true },
    select: { id: true, key: true, label: true }
  });

  const byKey = new Map(masterAttributes.map((a) => [a.key.toLowerCase(), a]));
  const byNormKey = new Map(masterAttributes.map((a) => [normalize(a.key), a]));
  const byNormLabel = new Map(masterAttributes.map((a) => [normalize(a.label), a]));

  let mappedColumns = 0;

  for (const row of columns) {
    const col = row.column_name;
    const { attr, mappedBy } = resolveAttributeForColumn(col, byKey, byNormKey, byNormLabel, excelMapLookup);

    if (attr) mappedColumns += 1;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO excel_column_attribute_mapping
        (column_name, normalized_column, attribute_id, attribute_key, attribute_label, mapped_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (column_name)
      DO UPDATE SET
        normalized_column = EXCLUDED.normalized_column,
        attribute_id = EXCLUDED.attribute_id,
        attribute_key = EXCLUDED.attribute_key,
        attribute_label = EXCLUDED.attribute_label,
        mapped_by = EXCLUDED.mapped_by,
        updated_at = NOW();
      `,
      col,
      normalize(col),
      attr?.id ?? null,
      attr?.key ?? null,
      attr?.label ?? null,
      mappedBy
    );
  }

  const mappedRows = await prisma.$queryRawUnsafe<ColumnRow[]>(`
    SELECT e.column_name, e.raw_value
    FROM excel_attribute_values e
    JOIN excel_column_attribute_mapping m
      ON m.column_name = e.column_name
    WHERE m.attribute_id IS NOT NULL
  `);

  const unique = new Map<string, { attributeId: number; value: string }>();

  const mappingRows = await prisma.$queryRawUnsafe<Array<{ column_name: string; attribute_id: number }>>(
    'SELECT column_name, attribute_id FROM excel_column_attribute_mapping WHERE attribute_id IS NOT NULL'
  );
  const attrByColumn = new Map(mappingRows.map((r) => [r.column_name, r.attribute_id]));

  for (const r of mappedRows) {
    const attributeId = attrByColumn.get(r.column_name);
    if (!attributeId) continue;
    const value = String(r.raw_value || '').trim();
    if (!value) continue;

    const key = `${attributeId}::${value}`;
    if (!unique.has(key)) {
      unique.set(key, { attributeId, value });
    }
  }

  const values = [...unique.values()];
  let processed = 0;

  for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
    const chunk = values.slice(i, i + INSERT_CHUNK_SIZE);
    await prisma.attributeAllowedValue.createMany({
      data: chunk.map((x) => ({
        attributeId: x.attributeId,
        shortForm: x.value,
        fullForm: x.value,
        isActive: true
      })),
      skipDuplicates: true
    });
    processed += chunk.length;
  }

  console.log('✅ Excel values mapped for extraction');
  console.log(`   Columns discovered: ${columns.length}`);
  console.log(`   Columns mapped to attributes: ${mappedColumns}`);
  console.log(`   Processed mapped values into attribute_allowed_values: ${processed}`);
}

main()
  .catch((error) => {
    console.error('❌ Excel-to-extraction sync failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
