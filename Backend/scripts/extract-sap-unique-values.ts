import fs from 'fs';
import path from 'path';

type JsonObject = Record<string, any>;

type MasterAttribute = {
  id: number;
  key: string;
  label: string;
  type: string;
};

type MappedColumn = {
  sapColumn: string;
  mapped: boolean;
  matchedBy: 'key-exact' | 'key-normalized' | 'label-normalized' | 'alias' | 'none';
  attributeId: number | null;
  attributeKey: string | null;
  attributeLabel: string | null;
  attributeType: string | null;
};

const DEFAULT_API_URL =
  process.env.SAP_API_URL ||
  'https://my-dab-app.azurewebsites.net/api/ET_ZCT04_CHAR_GET_RFC';
const SAP_API_MAX_PAGES = parseInt(process.env.SAP_API_MAX_PAGES || '5000', 10);

const OUTPUT_DIR = path.resolve(__dirname, '..', 'outputs');
const OUTPUT_UNIQUE_PATH = path.join(OUTPUT_DIR, 'sap-unique-values-by-column.json');
const OUTPUT_MAPPING_PATH = path.join(OUTPUT_DIR, 'sap-column-attribute-mapping.json');

const ALIAS_MAP: Record<string, string> = {
  colour: 'color',
  yarn01: 'yarn_01',
  yarn02: 'yarn_02',
  neckdetails: 'neck_detail',
  patchestype: 'patch_type',
  zippercolour: 'zip_colour',
  zipcolour: 'zip_colour',
  gramspersquaremeter: 'gram_per_square_meter'
};

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

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\n\r\t]/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function normalizeValue(value: unknown): string {
  return String(value)
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function extractRecords(payload: any): JsonObject[] {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
  }

  if (Array.isArray(payload?.d?.results)) {
    return payload.d.results.filter((row: any) => row && typeof row === 'object');
  }

  if (Array.isArray(payload?.value)) {
    return payload.value.filter((row: any) => row && typeof row === 'object');
  }

  const candidates: JsonObject[][] = [];

  function walk(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      const objects = node.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
      if (objects.length > 0) {
        candidates.push(objects);
      }
      for (const child of node) {
        walk(child);
      }
      return;
    }

    for (const value of Object.values(node)) {
      walk(value);
    }
  }

  walk(payload);

  if (candidates.length === 0) return [];
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

function buildUniqueValuesByColumn(records: JsonObject[]): Record<string, string[]> {
  const perColumn = new Map<string, Map<string, string>>();

  for (const row of records) {
    for (const [column, rawValue] of Object.entries(row)) {
      if (rawValue === null || rawValue === undefined) continue;

      const collector = perColumn.get(column) || new Map<string, string>();

      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const item of values) {
        if (item === null || item === undefined) continue;
        if (typeof item === 'object') continue;

        const pretty = normalizeValue(item);
        if (!pretty) continue;

        const dedupeKey = normalizeKey(pretty);
        if (!dedupeKey) continue;

        if (!collector.has(dedupeKey)) {
          collector.set(dedupeKey, pretty);
        }
      }

      perColumn.set(column, collector);
    }
  }

  const result: Record<string, string[]> = {};
  for (const [column, valuesMap] of [...perColumn.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    result[column] = [...valuesMap.values()].sort((a, b) => a.localeCompare(b));
  }

  return result;
}

function mapSapColumnsToAttributes(columns: string[], masterAttributes: MasterAttribute[]): MappedColumn[] {
  const byKey = new Map(masterAttributes.map((a) => [a.key.toLowerCase(), a]));
  const byNormalizedKey = new Map(masterAttributes.map((a) => [normalizeKey(a.key), a]));
  const byNormalizedLabel = new Map(masterAttributes.map((a) => [normalizeKey(a.label), a]));

  return columns.map((column) => {
    const lower = column.toLowerCase();
    const normalized = normalizeKey(column);
    const aliasTarget = ALIAS_MAP[normalized];
    const explicitTarget = SAP_COLUMN_TO_ATTRIBUTE_KEY[column];
    const withoutPrefix = column.replace(/^M_/, '');
    const normalizedWithoutPrefix = normalizeKey(withoutPrefix);

    let attr: MasterAttribute | undefined;
    let matchedBy: MappedColumn['matchedBy'] = 'none';

    if (explicitTarget && (byKey.has(explicitTarget.toLowerCase()) || byNormalizedKey.has(normalizeKey(explicitTarget)))) {
      attr = byKey.get(explicitTarget.toLowerCase()) || byNormalizedKey.get(normalizeKey(explicitTarget));
      matchedBy = 'alias';
    } else if (byKey.has(lower)) {
      attr = byKey.get(lower);
      matchedBy = 'key-exact';
    } else if (byNormalizedKey.has(normalizedWithoutPrefix)) {
      attr = byNormalizedKey.get(normalizedWithoutPrefix);
      matchedBy = 'key-normalized';
    } else if (byNormalizedLabel.has(normalizedWithoutPrefix)) {
      attr = byNormalizedLabel.get(normalizedWithoutPrefix);
      matchedBy = 'label-normalized';
    } else if (byNormalizedKey.has(normalized)) {
      attr = byNormalizedKey.get(normalized);
      matchedBy = 'key-normalized';
    } else if (byNormalizedLabel.has(normalized)) {
      attr = byNormalizedLabel.get(normalized);
      matchedBy = 'label-normalized';
    } else if (aliasTarget && (byKey.has(aliasTarget) || byNormalizedKey.has(normalizeKey(aliasTarget)))) {
      attr = byKey.get(aliasTarget) || byNormalizedKey.get(normalizeKey(aliasTarget));
      matchedBy = 'alias';
    }

    return {
      sapColumn: column,
      mapped: !!attr,
      matchedBy,
      attributeId: attr?.id ?? null,
      attributeKey: attr?.key ?? null,
      attributeLabel: attr?.label ?? null,
      attributeType: attr?.type ?? null
    };
  });
}

async function callSapApi(requestUrl: string = DEFAULT_API_URL): Promise<any> {
  const headers = {
    Accept: 'application/json',
    ...(process.env.SAP_API_HEADERS_JSON ? JSON.parse(process.env.SAP_API_HEADERS_JSON) : {})
  };

  const method = (process.env.SAP_API_METHOD || 'GET').toUpperCase();
  const queryJson = process.env.SAP_API_QUERY_JSON ? JSON.parse(process.env.SAP_API_QUERY_JSON) : null;
  const bodyJson = process.env.SAP_API_BODY_JSON ? JSON.parse(process.env.SAP_API_BODY_JSON) : null;

  const url = new URL(requestUrl);
  if (queryJson && typeof queryJson === 'object') {
    for (const [key, value] of Object.entries(queryJson)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    ...(bodyJson ? { body: JSON.stringify(bodyJson) } : {})
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SAP API failed: ${response.status} ${response.statusText} - ${text.slice(0, 1000)}`);
  }

  return response.json();
}

function getNextLink(payload: any): string | null {
  const candidateRaw =
    payload?.nextLink ||
    payload?.next ||
    payload?.['@odata.nextLink'] ||
    payload?.d?.__next ||
    payload?.d?.nextLink ||
    null;

  const candidate = typeof candidateRaw === 'string'
    ? candidateRaw.replace(/[\r\n\t\s]+/g, '').trim()
    : candidateRaw;

  if (!candidate || typeof candidate !== 'string') {
    return null;
  }

  const base = new URL(DEFAULT_API_URL);

  if (candidate.startsWith('/')) {
    return `${base.protocol}//${base.host}${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (url.host !== base.host || url.protocol !== base.protocol) {
      url.protocol = base.protocol;
      url.host = base.host;
    }
    return url.toString();
  } catch {
    // ignore, fallback below
  }

  return candidate;
}

async function fetchAllSapRecords(): Promise<JsonObject[]> {
  const allRecords: JsonObject[] = [];
  const seen = new Set<string>();

  let page = 1;
  let nextUrl: string | null = DEFAULT_API_URL;

  while (nextUrl && page <= SAP_API_MAX_PAGES) {
    if (seen.has(nextUrl)) {
      console.warn(`⚠️ Stopping pagination due to repeated nextLink at page ${page}.`);
      break;
    }
    seen.add(nextUrl);

    const payload = await callSapApi(nextUrl);

    const pageRecords = extractRecords(payload);
    allRecords.push(...pageRecords);

    const link = getNextLink(payload);
    nextUrl = link;

    if (page % 20 === 0 || !nextUrl) {
      console.log(`📄 Page ${page}: ${pageRecords.length} rows (total: ${allRecords.length})`);
    }

    page += 1;

    if (!nextUrl) {
      break;
    }
  }

  if (page > SAP_API_MAX_PAGES && nextUrl) {
    console.warn(`⚠️ Reached SAP_API_MAX_PAGES=${SAP_API_MAX_PAGES}; data may be partial.`);
  }

  return allRecords;
}

async function main(): Promise<void> {
  console.log('🔄 Fetching SAP article-wise data...');
  console.log(`🌐 URL: ${DEFAULT_API_URL}`);

  const records = await fetchAllSapRecords();

  if (records.length === 0) {
    throw new Error('No record array found in API payload. Please set SAP_API_QUERY_JSON / SAP_API_BODY_JSON correctly.');
  }

  console.log(`✅ Records fetched: ${records.length}`);

  const uniqueValuesByColumn = buildUniqueValuesByColumn(records);
  const sapColumns = Object.keys(uniqueValuesByColumn);

  const masterAttributesPath = path.resolve(__dirname, '..', 'master-attributes.json');
  const masterAttributes = readJsonIfExists<MasterAttribute[]>(masterAttributesPath) || [];

  if (masterAttributes.length === 0) {
    console.warn('⚠️ master-attributes.json not found or empty. Mapping quality will be limited.');
  }

  const mapping = mapSapColumnsToAttributes(sapColumns, masterAttributes);
  const mappedCount = mapping.filter((m) => m.mapped).length;

  ensureDir(OUTPUT_DIR);

  fs.writeFileSync(
    OUTPUT_UNIQUE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceUrl: DEFAULT_API_URL,
        totalRecords: records.length,
        totalColumns: sapColumns.length,
        uniqueValuesByColumn
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    OUTPUT_MAPPING_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceUrl: DEFAULT_API_URL,
        totalSapColumns: sapColumns.length,
        mappedColumns: mappedCount,
        unmappedColumns: sapColumns.length - mappedCount,
        columns: mapping
      },
      null,
      2
    )
  );

  console.log(`📦 Unique values file: ${OUTPUT_UNIQUE_PATH}`);
  console.log(`🧭 Mapping file: ${OUTPUT_MAPPING_PATH}`);
  console.log(`📈 Mapping coverage: ${mappedCount}/${sapColumns.length}`);
}

main().catch((error) => {
  console.error('❌ Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
