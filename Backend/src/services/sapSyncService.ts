import fs from 'fs';
import path from 'path';

type SapSyncItemInput = {
  id: string;
  [key: string]: unknown;
};

type SapMapRow = {
  Attributes?: string;
  'API Name'?: string;
  'SAP NAME'?: string;
};

type SapFieldMapping = {
  attribute: string;
  apiName: string;
};

export type SapSyncItemResult = {
  id: string;
  success: boolean;
  message: string;
  statusCode?: number;
  sapArticleNumber?: string;
};

const SAP_SYNC_URL =
  process.env.SAP_SYNC_URL ||
  'https://routemaster.v2retail.com:9010/api/ZMM_ART_CREATION_RFC';

const SAP_SYNC_ENABLED =
  (process.env.SAP_SYNC_ENABLED || 'true').toLowerCase() === 'true';

const SAP_SYNC_TIMEOUT_MS = Number(process.env.SAP_SYNC_TIMEOUT_MS || 60000);
const SAP_RETRY_VENDOR_ONLY_ON_UNKNOWN_ELEMENT =
  (process.env.SAP_RETRY_VENDOR_ONLY_ON_UNKNOWN_ELEMENT || 'false').toLowerCase() === 'true';

const SAP_MAP_PATH = path.resolve(__dirname, '../../../map.json');

const toSapValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('toString' in (value as object)) {
      const text = String(value);
      return text.trim() ? text : null;
    }
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
};

const snakeToCamel = (value: string): string =>
  value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const parseMapRows = (): SapMapRow[] => {
  const raw = fs.readFileSync(SAP_MAP_PATH, 'utf8').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const wrapped = `[${raw.replace(/^,\s*/, '')}]`;
    const parsed = JSON.parse(wrapped);
    return Array.isArray(parsed) ? parsed : [];
  }
};

const sapFieldMappings: SapFieldMapping[] = parseMapRows()
  .map((row) => {
    const attribute = (row.Attributes || '').trim();
    const apiName = (row['API Name'] || row['SAP NAME'] || '').trim();
    if (!attribute || !apiName) return null;
    return { attribute, apiName };
  })
  .filter((row): row is SapFieldMapping => !!row);

const getVendorValue = (item: SapSyncItemInput): string => {
  const vendor = String(item.vendorCode || item.vendorName || '').trim();
  return vendor;
};

type SapCallOutcome = {
  ok: boolean;
  statusCode: number;
  message: string;
  isUnknownElementError: boolean;
  sapArticleNumber?: string;
};

const buildVendorOnlyBody = (item: SapSyncItemInput): string => {
  const vendor = getVendorValue(item);
  const params = new URLSearchParams();
  if (vendor) params.set('VENDOR', vendor);
  return params.toString();
};

const getCandidateValue = (source: Record<string, unknown>, keys: string[]): string | null => {
  for (const [k, v] of Object.entries(source)) {
    const normalized = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (keys.includes(normalized)) {
      const text = toSapValue(v);
      if (text) return text;
    }
  }
  return null;
};

const extractSapArticleNumber = (parsed: unknown, message: string): string | undefined => {
  const candidateKeys = [
    'ARTICLENUMBER',
    'SAPARTICLENUMBER',
    'SAPARTICLEID',
    'ARTICLEID',
    'MATNR',
    'ARTICLE_NO',
    'ARTICLENO',
    'ARTICLE'
  ].map((k) => k.replace(/[^A-Z0-9]/g, ''));

  if (parsed && typeof parsed === 'object') {
    const found = getCandidateValue(parsed as Record<string, unknown>, candidateKeys);
    if (found) return found;

    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        const nested = getCandidateValue(value as Record<string, unknown>, candidateKeys);
        if (nested) return nested;
      }
    }
  }

  const fromMessage = message.match(/(?:article\s*number|matnr|article\s*id)\s*[:=-]\s*([A-Z0-9\-_/]+)/i);
  if (fromMessage?.[1]) return fromMessage[1];

  return undefined;
};

const parseSapResponse = (statusCode: number, responseText: string): SapCallOutcome => {
  let message = responseText.slice(0, 300) || `SAP sync failed with status ${statusCode}`;
  let isBusinessFailure = false;
  let parsedBody: unknown;
  let sapArticleNumber: string | undefined;
  let msgType: string | undefined;

  try {
    const parsed = JSON.parse(responseText) as {
      Status?: boolean;
      Message?: string;
      MESSAGE?: string;
      MSG_TYP?: string;
      SAP_ART?: string;
    };
    parsedBody = parsed;

    // Primary integration contract fields from SAP:
    // SAP_ART, MSG_TYP, MESSAGE
    if (typeof parsed?.SAP_ART === 'string' && parsed.SAP_ART.trim()) {
      sapArticleNumber = parsed.SAP_ART.trim();
    }

    if (typeof parsed?.MSG_TYP === 'string' && parsed.MSG_TYP.trim()) {
      msgType = parsed.MSG_TYP.trim().toUpperCase();
    }

    if (typeof parsed?.MESSAGE === 'string' && parsed.MESSAGE.trim()) {
      message = parsed.MESSAGE.trim();
    }

    if (typeof parsed?.Message === 'string' && parsed.Message.trim()) {
      message = parsed.Message.trim();
    }

    if (parsed?.Status === false) {
      isBusinessFailure = true;
    }
  } catch {
    // Non-JSON response, keep fallback message
  }

  const lowerMessage = message.toLowerCase();
  const isUnknownElementError =
    lowerMessage.includes('unknown') &&
    (lowerMessage.includes('element') || lowerMessage.includes('container metadata'));

  sapArticleNumber = sapArticleNumber || extractSapArticleNumber(parsedBody, message);

  // We don't persist MSG_TYP in DB (no column), but keep it visible in sync message.
  if (msgType) {
    message = `[MSG_TYP=${msgType}] ${message}`;
  }

  const ok = statusCode >= 200 && statusCode < 300 && !isBusinessFailure;
  return {
    ok,
    statusCode,
    message,
    isUnknownElementError,
    sapArticleNumber
  };
};

const callSap = async (body: string): Promise<SapCallOutcome> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SAP_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(SAP_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal: controller.signal
    });

    const responseText = await response.text();
    return parseSapResponse(response.status, responseText);
  } finally {
    clearTimeout(timeout);
  }
};

const buildSapFormBody = (item: SapSyncItemInput): string => {
  const params = new URLSearchParams();

  for (const mapping of sapFieldMappings) {
    const direct = item[mapping.attribute];
    const camel = item[snakeToCamel(mapping.attribute)];
    const value = toSapValue(direct ?? camel);
    if (!value) continue;

    params.append(mapping.apiName, value);
  }

  // Keep vendor mandatory for current dev checks.
  const vendor = getVendorValue(item);
  if (vendor) {
    params.set('VENDOR', vendor);
  }

  return params.toString();
};

export const syncApprovedItemsToSap = async (
  items: SapSyncItemInput[]
): Promise<SapSyncItemResult[]> => {
  if (!SAP_SYNC_ENABLED) {
    return items.map((item) => ({
      id: item.id,
      success: false,
      message: 'SAP sync is disabled (SAP_SYNC_ENABLED=false)'
    }));
  }

  const results: SapSyncItemResult[] = [];

  for (const item of items) {
    const vendor = getVendorValue(item);
    if (!vendor) {
      results.push({
        id: item.id,
        success: false,
        message: 'Vendor is missing (vendorCode/vendorName not available)'
      });
      continue;
    }

    try {
      const fullBody = buildSapFormBody(item);
      const firstAttempt = await callSap(fullBody);

      if (firstAttempt.ok) {
        results.push({
          id: item.id,
          success: true,
          statusCode: firstAttempt.statusCode,
          message: firstAttempt.message || 'SAP sync success',
          sapArticleNumber: firstAttempt.sapArticleNumber
        });
      } else {
        // Optional retry: disabled by default to avoid duplicate API hits.
        if (firstAttempt.isUnknownElementError && SAP_RETRY_VENDOR_ONLY_ON_UNKNOWN_ELEMENT) {
          const retryOutcome = await callSap(buildVendorOnlyBody(item));
          if (retryOutcome.ok) {
            results.push({
              id: item.id,
              success: true,
              statusCode: retryOutcome.statusCode,
              message: `Retried with VENDOR only. ${retryOutcome.message}`,
              sapArticleNumber: retryOutcome.sapArticleNumber
            });
          } else {
            results.push({
              id: item.id,
              success: false,
              statusCode: retryOutcome.statusCode,
              message: `Full payload failed: ${firstAttempt.message}. Retry failed: ${retryOutcome.message}`
            });
          }
        } else {
          results.push({
            id: item.id,
            success: false,
            statusCode: firstAttempt.statusCode,
            message: firstAttempt.message
          });
        }
      }
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? `SAP request timeout after ${SAP_SYNC_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : 'Unknown SAP sync error';
      results.push({
        id: item.id,
        success: false,
        message
      });
    }
  }

  return results;
};
