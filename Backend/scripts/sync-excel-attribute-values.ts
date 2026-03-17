import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import { prismaClient as prisma } from '../src/utils/prisma';

const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsb', '.xlsm']);
const DEFAULT_SCAN_DIRS = [
  path.resolve(__dirname, '..', '..'),
  path.resolve(__dirname, '..', 'uploads')
];

const COLUMN_ALIASES = {
  vendor: ['vendor'],
  vendorName: ['vendorname', 'vendor_name', 'vendornm', 'vendornm'],
  mcCd: ['mccd', 'mc_cd', 'mccode', 'mccod', 'mc code'],
  majCatNm: ['majcatnm', 'maj_cat_nm', 'majorcategoryname', 'majcatname', 'majcat', 'majorcatnm']
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function cleanCell(value: unknown): string {
  return String(value ?? '')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInputDirs(): string[] {
  if (!process.env.EXCEL_INPUT_DIRS) {
    return DEFAULT_SCAN_DIRS;
  }

  return process.env.EXCEL_INPUT_DIRS
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => path.resolve(x));
}

async function listExcelFiles(dirs: string[]): Promise<string[]> {
  const all: string[] = [];

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const fullPath = path.join(dir, entry.name);
        const ext = path.extname(entry.name).toLowerCase();
        if (!EXCEL_EXTENSIONS.has(ext)) continue;

        // Skip temporary Excel lock files
        if (entry.name.startsWith('~$')) continue;

        all.push(fullPath);
      }
    } catch {
      // ignore missing dirs
    }
  }

  return all;
}

function findIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map((h) => normalizeText(h));
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (aliases.includes(normalizedHeaders[i])) {
      return i;
    }
    if (aliases.some((alias) => normalizedHeaders[i].includes(alias))) {
      return i;
    }
  }
  return -1;
}

function detectHeaderRow(rows: any[][]): number {
  const scanUpto = Math.min(rows.length, 15);
  let bestRow = 0;
  let bestScore = -1;

  for (let r = 0; r < scanUpto; r += 1) {
    const headers = (rows[r] || []).map((h) => cleanCell(h));
    const score = [
      findIndex(headers, COLUMN_ALIASES.vendor) >= 0 ? 1 : 0,
      findIndex(headers, COLUMN_ALIASES.vendorName) >= 0 ? 1 : 0,
      findIndex(headers, COLUMN_ALIASES.mcCd) >= 0 ? 1 : 0,
      findIndex(headers, COLUMN_ALIASES.majCatNm) >= 0 ? 2 : 0
    ].reduce((a, b) => a + b, 0);

    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }

  return bestRow;
}

function pickTargetColumns(headers: string[]): { indices: number[]; names: string[] } {
  const vendorIdx = findIndex(headers, COLUMN_ALIASES.vendor);
  const vendorNameIdx = findIndex(headers, COLUMN_ALIASES.vendorName);
  const mcCdIdx = findIndex(headers, COLUMN_ALIASES.mcCd);
  const majCatIdx = findIndex(headers, COLUMN_ALIASES.majCatNm);

  if (majCatIdx < 0) {
    throw new Error(`MAJ_Cat_NM column not found in sheet header. Headers: ${headers.join(' | ')}`);
  }

  const selected = new Set<number>();
  if (vendorIdx >= 0) selected.add(vendorIdx);
  if (vendorNameIdx >= 0) selected.add(vendorNameIdx);
  if (mcCdIdx >= 0) selected.add(mcCdIdx);

  for (let i = majCatIdx; i < headers.length; i += 1) {
    selected.add(i);
  }

  const indices = [...selected].sort((a, b) => a - b);
  return {
    indices,
    names: indices.map((i) => headers[i])
  };
}

async function ensureTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS excel_attribute_values (
      id BIGSERIAL PRIMARY KEY,
      column_name VARCHAR(255) NOT NULL,
      raw_value TEXT NOT NULL,
      normalized_value VARCHAR(500) NOT NULL,
      first_seen_file VARCHAR(500) NULL,
      last_seen_file VARCHAR(500) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(column_name, normalized_value)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_excel_attr_values_column ON excel_attribute_values(column_name);
  `);
}

async function processExcelFile(filePath: string): Promise<{ attempted: number; columns: number }> {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    raw: false,
    dense: true
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Workbook has no sheets.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: ''
  });

  if (rows.length < 2) {
    throw new Error('Sheet has no data rows.');
  }

  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] || []).map((h) => cleanCell(h));
  const { indices } = pickTargetColumns(headers);

  const uniqueByColumn = new Map<string, Map<string, string>>();

  for (let r = headerRowIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    for (const idx of indices) {
      const columnName = headers[idx];
      if (!columnName) continue;

      const cell = cleanCell(row[idx]);
      if (!cell) continue;

      const normalized = normalizeText(cell);
      if (!normalized) continue;

      const bucket = uniqueByColumn.get(columnName) || new Map<string, string>();
      if (!bucket.has(normalized)) {
        bucket.set(normalized, cell);
      }
      uniqueByColumn.set(columnName, bucket);
    }
  }

  const fileName = path.basename(filePath);
  const rowsToUpsert: Array<[string, string, string, string, string]> = [];

  for (const [columnName, valueMap] of uniqueByColumn.entries()) {
    for (const [normalizedValue, rawValue] of valueMap.entries()) {
      rowsToUpsert.push([columnName, rawValue, normalizedValue, fileName, fileName]);
    }
  }

  const CHUNK_SIZE = 500;

  for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
    const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE);
    const valuesSql = chunk
      .map((_, idx) => {
        const base = idx * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      })
      .join(', ');

    const params = chunk.flat();

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO excel_attribute_values
        (column_name, raw_value, normalized_value, first_seen_file, last_seen_file)
      VALUES ${valuesSql}
      ON CONFLICT (column_name, normalized_value)
      DO UPDATE SET
        last_seen_file = EXCLUDED.last_seen_file,
        raw_value = EXCLUDED.raw_value,
        updated_at = NOW();
      `,
      ...params
    );
  }

  return { attempted: rowsToUpsert.length, columns: uniqueByColumn.size };
}

async function processOnce(): Promise<void> {
  await ensureTable();

  const files = await listExcelFiles(parseInputDirs());
  if (!files.length) {
    console.log('ℹ️ No Excel file found.');
    return;
  }

  for (const filePath of files) {
    console.log(`📥 Processing Excel: ${filePath}`);
    const result = await processExcelFile(filePath);
    await fs.unlink(filePath);
    console.log(`✅ Synced unique values. Columns: ${result.columns}, values processed: ${result.attempted}`);
    console.log(`🗑️ Deleted file: ${filePath}`);
  }
}

async function watchLoop(): Promise<void> {
  const intervalSec = parseInt(process.env.EXCEL_SYNC_INTERVAL_SEC || '60', 10);
  console.log(`👀 Watching for Excel files every ${intervalSec}s...`);

  while (true) {
    try {
      await processOnce();
    } catch (error: any) {
      console.error('❌ Excel sync cycle failed:', error?.message || error);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
  }
}

async function main(): Promise<void> {
  const watchMode = process.argv.includes('--watch');

  if (watchMode) {
    await watchLoop();
    return;
  }

  await processOnce();
}

main()
  .catch((error: any) => {
    console.error('❌ Excel sync failed:', error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
