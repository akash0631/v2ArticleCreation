import { prismaClient as prisma } from '../src/utils/prisma';

type JsonObject = Record<string, any>;

type MasterAttribute = {
  id: number;
  key: string;
  label: string;
};

const SAP_API_URL =
  process.env.SAP_API_URL ||
  'http://my-dab-app.azurewebsites.net/api/ET_ZCT04_CHAR_GET_RFC';
const SAP_API_MAX_PAGES = parseInt(process.env.SAP_API_MAX_PAGES || '10000', 10);
const SAP_FETCH_BATCH_PAGES = parseInt(process.env.SAP_FETCH_BATCH_PAGES || '1', 10);
const SAP_PAGINATION_STRATEGY = (process.env.SAP_PAGINATION_STRATEGY || 'sequential').toLowerCase();
const SAP_FORCE_HTTPS_NEXTLINK = (process.env.SAP_FORCE_HTTPS_NEXTLINK || 'true').toLowerCase() === 'true';
const INSERT_CHUNK_SIZE = parseInt(process.env.SAP_SYNC_INSERT_CHUNK_SIZE || '1000', 10);
const SAP_FETCH_RETRIES = parseInt(process.env.SAP_FETCH_RETRIES || '4', 10);
const SAP_FETCH_TIMEOUT_MS = parseInt(process.env.SAP_FETCH_TIMEOUT_MS || '30000', 10);

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

function extractRecords(payload: any): JsonObject[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
  }
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.value)) return payload.value;

  const candidates: JsonObject[][] = [];

  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const objects = node.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
      if (objects.length) candidates.push(objects);
      node.forEach(walk);
      return;
    }
    Object.values(node).forEach(walk);
  };

  walk(payload);
  if (!candidates.length) return [];
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
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

  const base = new URL(SAP_API_URL);

  if (candidate.startsWith('/')) {
    return `${base.protocol}//${base.host}${candidate}`;
  }

  // Keep pagination on the same origin/protocol as configured API URL
  // to avoid proxy/TLS mismatches from server-provided absolute links.
  try {
    const url = new URL(candidate);
    if (url.host !== base.host || url.protocol !== base.protocol) {
      url.protocol = base.protocol;
      url.host = base.host;
    }
    return url.toString();
  } catch {
    // Fallback for unexpected non-URL next links
  }

  return candidate;
}

type CursorTemplate = {
  templateUrl: URL;
  afterParamName: string;
  token: any[];
  fieldValue: number;
};

function parseCursorTemplate(nextUrl: string): CursorTemplate | null {
  try {
    const url = new URL(nextUrl);
    const afterParamName = url.searchParams.has('$after') ? '$after' : (url.searchParams.has('after') ? 'after' : '');
    if (!afterParamName) return null;

    const raw = url.searchParams.get(afterParamName);
    if (!raw) return null;

    const tokenJson = Buffer.from(decodeURIComponent(raw), 'base64').toString('utf-8');
    const token = JSON.parse(tokenJson);
    if (!Array.isArray(token) || !token.length) return null;

    const value = Number(token[0]?.FieldValue);
    if (!Number.isFinite(value)) return null;

    return {
      templateUrl: url,
      afterParamName,
      token,
      fieldValue: value
    };
  } catch {
    return null;
  }
}

function buildCursorUrl(template: CursorTemplate, fieldValue: number): string {
  const url = new URL(template.templateUrl.toString());
  const nextToken = JSON.parse(JSON.stringify(template.token));
  nextToken[0].FieldValue = fieldValue;
  const encoded = Buffer.from(JSON.stringify(nextToken), 'utf-8').toString('base64');
  url.searchParams.set(template.afterParamName, encoded);
  return url.toString();
}

function normalizeRequestUrl(rawUrl: string): string {
  const cleaned = rawUrl.replace(/[\r\n\t\s]+/g, '').trim();
  if (SAP_FORCE_HTTPS_NEXTLINK && cleaned.startsWith('http://')) {
    return `https://${cleaned.slice('http://'.length)}`;
  }
  return cleaned;
}

async function fetchPage(requestUrl: string): Promise<any> {
  const method = (process.env.SAP_API_METHOD || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(process.env.SAP_API_HEADERS_JSON ? JSON.parse(process.env.SAP_API_HEADERS_JSON) : {})
  };

  const queryJson = process.env.SAP_API_QUERY_JSON ? JSON.parse(process.env.SAP_API_QUERY_JSON) : null;
  const bodyJson = process.env.SAP_API_BODY_JSON ? JSON.parse(process.env.SAP_API_BODY_JSON) : null;

  const normalizedUrl = normalizeRequestUrl(requestUrl);
  const url = new URL(normalizedUrl);
  if (queryJson && typeof queryJson === 'object') {
    for (const [key, value] of Object.entries(queryJson)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let lastError: any;

  for (let attempt = 0; attempt <= SAP_FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SAP_FETCH_TIMEOUT_MS);

    try {
      let response = await fetch(url.toString(), {
        method,
        headers,
        signal: controller.signal,
        ...(bodyJson ? { body: JSON.stringify(bodyJson) } : {})
      });

      if (response.status === 403 && url.protocol === 'http:') {
        const httpsUrl = new URL(url.toString());
        httpsUrl.protocol = 'https:';
        response = await fetch(httpsUrl.toString(), {
          method,
          headers,
          signal: controller.signal,
          ...(bodyJson ? { body: JSON.stringify(bodyJson) } : {})
        });
      }

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`SAP API failed: ${response.status} ${response.statusText} - ${text.slice(0, 1000)}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt >= SAP_FETCH_RETRIES) {
        throw error;
      }

      const waitMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      const detail =
        (error as any)?.cause?.code
          ? `${(error as any).cause.code}: ${(error as any).cause.message || ''}`
          : ((error as any)?.message || 'unknown error');
      console.warn(`⚠️ Page fetch failed (attempt ${attempt + 1}/${SAP_FETCH_RETRIES + 1}) [${detail}]. Retrying in ${waitMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

async function fetchSapData(): Promise<JsonObject[]> {
  const allRecords: JsonObject[] = [];
  const seen = new Set<string>();

  let page = 1;
  let nextUrl: string | null = SAP_API_URL;

  // First page always sequential (needed to detect cursor format)
  if (nextUrl && page <= SAP_API_MAX_PAGES) {
    const firstPayload = await fetchPage(nextUrl);
    const firstRecords = extractRecords(firstPayload);
    allRecords.push(...firstRecords);
    nextUrl = getNextLink(firstPayload);
    seen.add(SAP_API_URL);
    if (!nextUrl) {
      console.log(`📄 Page 1: ${firstRecords.length} rows (total: ${allRecords.length})`);
      return allRecords;
    }
    page = 2;
  }

  const cursorTemplate = nextUrl ? parseCursorTemplate(nextUrl) : null;
  const canCursorJump =
    SAP_PAGINATION_STRATEGY === 'cursor-jump' &&
    SAP_FETCH_BATCH_PAGES > 1 &&
    !!cursorTemplate;

  if (canCursorJump && cursorTemplate) {
    console.log(`🚀 Cursor-jump mode enabled: fetching up to ${SAP_FETCH_BATCH_PAGES} pages in parallel`);

    let currentFieldValue = cursorTemplate.fieldValue;
    let hasMore = true;
    let degradedToSequential = false;

    while (hasMore && page <= SAP_API_MAX_PAGES) {
      const batchSize = Math.min(SAP_FETCH_BATCH_PAGES, SAP_API_MAX_PAGES - page + 1);
      const urls = Array.from({ length: batchSize }, (_, i) => buildCursorUrl(cursorTemplate, currentFieldValue + i * 100));

      let payloads: any[] = [];
      try {
        payloads = await Promise.all(urls.map((u) => fetchPage(u)));
      } catch (error: any) {
        degradedToSequential = true;
        nextUrl = buildCursorUrl(cursorTemplate, currentFieldValue);
        console.warn(`⚠️ Cursor-jump batch failed (${error?.message || 'unknown error'}). Falling back to sequential mode.`);
        break;
      }

      let processed = 0;
      for (const payload of payloads) {
        const records = extractRecords(payload);
        const link = getNextLink(payload);

        allRecords.push(...records);
        processed += 1;

        if (!link) {
          hasMore = false;
          break;
        }
      }

      currentFieldValue += processed * 100;
      page += processed;

      if ((page - 1) % 20 === 0 || !hasMore) {
        console.log(`📄 Page ${page - 1}: batch ${processed} pages (total rows: ${allRecords.length})`);
      }
    }

    if (page > SAP_API_MAX_PAGES && hasMore) {
      console.warn(`⚠️ Reached SAP_API_MAX_PAGES=${SAP_API_MAX_PAGES}; data may be partial.`);
    }

    if (!degradedToSequential) {
      return allRecords;
    }
  }

  while (nextUrl && page <= SAP_API_MAX_PAGES) {
    if (seen.has(nextUrl)) {
      console.warn(`⚠️ Pagination stopped due to repeated nextLink at page ${page}.`);
      break;
    }
    seen.add(nextUrl);

    const payload = await fetchPage(nextUrl);
    const records = extractRecords(payload);
    allRecords.push(...records);

    nextUrl = getNextLink(payload);

    if (page % 20 === 0 || !nextUrl) {
      console.log(`📄 Page ${page}: ${records.length} rows (total: ${allRecords.length})`);
    }

    page += 1;
  }

  if (page > SAP_API_MAX_PAGES && nextUrl) {
    console.warn(`⚠️ Reached SAP_API_MAX_PAGES=${SAP_API_MAX_PAGES}; data may be partial.`);
  }

  return allRecords;
}

async function ensureStagingTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sap_attribute_values_staging (
      id BIGSERIAL PRIMARY KEY,
      sync_run_id VARCHAR(64) NOT NULL,
      sap_column VARCHAR(150) NOT NULL,
      sap_value VARCHAR(500) NOT NULL,
      normalized_value VARCHAR(500) NOT NULL,
      attribute_id INT NULL,
      attribute_key VARCHAR(100) NULL,
      source_url TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_sap_attr_stage_run ON sap_attribute_values_staging(sync_run_id);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_sap_attr_stage_attr ON sap_attribute_values_staging(attribute_id);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_sap_attr_stage_lookup
    ON sap_attribute_values_staging(sap_column, normalized_value, attribute_id);
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE sap_attribute_values_staging
    SET attribute_id = -1
    WHERE attribute_id IS NULL;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sap_attr_stage_unique
    ON sap_attribute_values_staging(sap_column, normalized_value, attribute_id);
  `);
}

type StagingRow = {
  syncRunId: string;
  sapColumn: string;
  sapValue: string;
  normalizedValue: string;
  attributeId: number;
  attributeKey: string | null;
  sourceUrl: string;
};

async function insertStagingRows(rows: StagingRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  let insertedTotal = 0;

  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const values: any[] = [];
    const placeholders: string[] = [];

    chunk.forEach((row, idx) => {
      const p = idx * 7;
      placeholders.push(`($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7})`);
      values.push(
        row.syncRunId,
        row.sapColumn,
        row.sapValue,
        row.normalizedValue,
        row.attributeId,
        row.attributeKey,
        row.sourceUrl
      );
    });

    const inserted = await prisma.$executeRawUnsafe(
      `
      INSERT INTO sap_attribute_values_staging
        (sync_run_id, sap_column, sap_value, normalized_value, attribute_id, attribute_key, source_url)
      VALUES ${placeholders.join(',')}
      ON CONFLICT (sap_column, normalized_value, attribute_id) DO NOTHING;
      `,
      ...values
    );

    insertedTotal += Number(inserted || 0);
  }

  return insertedTotal;
}

async function main(): Promise<void> {
  const syncRunId = `${Date.now()}`;
  console.log(`🔄 SAP sync started (run: ${syncRunId})`);

  const records = await fetchSapData();
  if (!records.length) {
    throw new Error('No records returned by SAP API.');
  }

  console.log(`✅ Records fetched: ${records.length}`);

  const masterAttributes = await prisma.masterAttribute.findMany({
    where: { isActive: true },
    select: { id: true, key: true, label: true }
  });

  const byKey = new Map(masterAttributes.map((a) => [a.key.toLowerCase(), a]));
  const byNormalizedKey = new Map(masterAttributes.map((a) => [normalizeKey(a.key), a]));
  const byNormalizedLabel = new Map(masterAttributes.map((a) => [normalizeKey(a.label), a]));

  const uniquePerColumn = new Map<string, Map<string, string>>();

  for (const row of records) {
    for (const [col, raw] of Object.entries(row)) {
      if (raw === null || raw === undefined || typeof raw === 'object') continue;

      const clean = normalizeValue(raw);
      if (!clean) continue;

      const norm = normalizeKey(clean);
      if (!norm) continue;

      const map = uniquePerColumn.get(col) || new Map<string, string>();
      if (!map.has(norm)) map.set(norm, clean);
      uniquePerColumn.set(col, map);
    }
  }

  await ensureStagingTable();

  const stagingRows: StagingRow[] = [];
  const mappedAllowedValueMap = new Map<string, { attributeId: number; value: string }>();

  for (const [sapColumn, valuesMap] of uniquePerColumn.entries()) {
    const explicitTarget = SAP_COLUMN_TO_ATTRIBUTE_KEY[sapColumn];
    const normalizedColumn = normalizeKey(sapColumn);
    const noPrefixNormalized = normalizeKey(sapColumn.replace(/^M_/, ''));

    const matchedAttr: MasterAttribute | undefined =
      (explicitTarget ? byKey.get(explicitTarget.toLowerCase()) || byNormalizedKey.get(normalizeKey(explicitTarget)) : undefined) ||
      byKey.get(sapColumn.toLowerCase()) ||
      byNormalizedKey.get(normalizedColumn) ||
      byNormalizedKey.get(noPrefixNormalized) ||
      byNormalizedLabel.get(noPrefixNormalized) ||
      byNormalizedLabel.get(normalizedColumn);

    const attributeId = matchedAttr?.id ?? null;
    const attributeKey = matchedAttr?.key ?? null;

    for (const [normalizedValue, sapValue] of valuesMap.entries()) {
      const attributeIdForStage = attributeId ?? -1;

      stagingRows.push({
        syncRunId,
        sapColumn,
        sapValue,
        normalizedValue,
        attributeId: attributeIdForStage,
        attributeKey,
        sourceUrl: SAP_API_URL
      });

      if (attributeId) {
        const key = `${attributeId}::${sapValue}`;
        if (!mappedAllowedValueMap.has(key)) {
          mappedAllowedValueMap.set(key, { attributeId, value: sapValue });
        }
      }
    }
  }

  const stagedRows = await insertStagingRows(stagingRows);

  const mappedAllowedValues = [...mappedAllowedValueMap.values()];
  let upsertedRows = 0;

  for (let i = 0; i < mappedAllowedValues.length; i += INSERT_CHUNK_SIZE) {
    const chunk = mappedAllowedValues.slice(i, i + INSERT_CHUNK_SIZE);
    await prisma.attributeAllowedValue.createMany({
      data: chunk.map((item) => ({
        attributeId: item.attributeId,
        shortForm: item.value,
        fullForm: item.value,
        isActive: true
      })),
      skipDuplicates: true
    });
    upsertedRows += chunk.length;
  }

  const mappedRows = stagingRows.filter((r) => r.attributeId !== -1).length;

  console.log('✅ SAP sync completed');
  console.log(`   Staged rows: ${stagedRows}`);
  console.log(`   Mapped rows: ${mappedRows}`);
  console.log(`   Processed mapped values for attribute_allowed_values: ${upsertedRows}`);
}

main()
  .catch((error) => {
    console.error('❌ SAP sync failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
