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

const normalizeSapKey = (key: string): string => key.toUpperCase().replace(/[^A-Z0-9]/g, '');

const MESSAGE_KEYS = new Set([
  'MESSAGE',
  'MESSAGES',
  'MSG',
  'TEXT',
  'DETAIL',
  'DETAILS',
  'ERROR',
  'ERRORMESSAGE',
  'LONGTEXT',
  'MESSAGEV1',
  'MESSAGEV2',
  'MESSAGEV3',
  'MESSAGEV4',
  'MESSAGE1',
  'MESSAGE2',
  'MESSAGE3',
  'MESSAGE4'
].map(normalizeSapKey));

const RETURN_TABLE_KEYS = new Set(['RETURN', 'RETURNS', 'ETRETURN', 'TRETURN']);

const normalizeMessageText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const tryParseSapJson = (raw: string): unknown => {
  const text = String(raw || '').trim();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    // Some SAP gateways prepend/append non-JSON wrappers.
    const startObj = text.indexOf('{');
    const endObj = text.lastIndexOf('}');
    if (startObj >= 0 && endObj > startObj) {
      const candidate = text.slice(startObj, endObj + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // ignore
      }
    }

    const startArr = text.indexOf('[');
    const endArr = text.lastIndexOf(']');
    if (startArr >= 0 && endArr > startArr) {
      const candidate = text.slice(startArr, endArr + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // ignore
      }
    }

    return undefined;
  }
};

const collectSapMessages = (input: unknown): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown) => {
    const normalized = normalizeMessageText(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };

  const visit = (node: unknown) => {
    if (node === null || node === undefined) return;

    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (typeof node === 'object') {
      const record = node as Record<string, unknown>;

      // Handle SAP RETURN row structures where message can be split across fields.
      const rowType = normalizeMessageText(record.TYPE ?? record.MsgType ?? record.MSG_TYP);
      const rowMessage = normalizeMessageText(record.MESSAGE ?? record.Message ?? record.MSG);
      const rowMessageParts = [
        normalizeMessageText(record.MESSAGE_V1 ?? record.MESSAGEV1),
        normalizeMessageText(record.MESSAGE_V2 ?? record.MESSAGEV2),
        normalizeMessageText(record.MESSAGE_V3 ?? record.MESSAGEV3),
        normalizeMessageText(record.MESSAGE_V4 ?? record.MESSAGEV4)
      ].filter((part): part is string => !!part);

      const hasReturnRowSignature =
        rowType || rowMessage || rowMessageParts.length > 0 || record.ID || record.NUMBER;

      if (hasReturnRowSignature) {
        const id = normalizeMessageText(record.ID);
        const number = normalizeMessageText(record.NUMBER);
        const merged = [rowMessage, ...rowMessageParts].filter((m): m is string => !!m).join(' | ');
        if (merged) {
          const codePrefix = [id, number].filter(Boolean).join('-');
          const prefix = [rowType ? `[${rowType}]` : null, codePrefix ? `[${codePrefix}]` : null]
            .filter(Boolean)
            .join(' ');

          add(prefix ? `${prefix} ${merged}` : merged);
        }
      }

      for (const [rawKey, value] of Object.entries(record)) {
        const normalizedKey = normalizeSapKey(rawKey);

        if (MESSAGE_KEYS.has(normalizedKey)) {
          add(value);
        }

        if (RETURN_TABLE_KEYS.has(normalizedKey) && Array.isArray(value)) {
          for (const row of value) {
            visit(row);
          }
          continue;
        }

        visit(value);
      }
    }
  };

  visit(input);
  return out;
};

const buildSapSyncMessage = (rawResponse: string, parsedBody: unknown, statusCode: number, msgType?: string): string => {
  const payloadText = String(rawResponse || '').trim();
  const extractedMessages = collectSapMessages(parsedBody);

  let combinedMessage = '';

  // Keep only message text returned by SAP (no raw JSON payload in UI/DB message field).
  if (extractedMessages.length > 0) {
    combinedMessage = extractedMessages.length === 1
      ? extractedMessages[0]
      : extractedMessages.map((m, i) => `${i + 1}. ${m}`).join('\n');
  } else if (payloadText && !payloadText.startsWith('{') && !payloadText.startsWith('[')) {
    // Non-JSON plain-text SAP responses are treated as direct SAP message text.
    combinedMessage = payloadText;
  } else {
    combinedMessage = `No detailed message returned by SAP (HTTP ${statusCode})`;
  }

  if (msgType && !combinedMessage.startsWith(`[MSG_TYP=${msgType}]`)) {
    combinedMessage = `[MSG_TYP=${msgType}] ${combinedMessage}`;
  }

  return combinedMessage.trim() || `SAP sync response empty`;
};

const parseSapResponse = (statusCode: number, responseText: string): SapCallOutcome => {
  const rawResponse = String(responseText || '').trim();
  let message = rawResponse || `SAP sync failed with status ${statusCode}`;
  let isBusinessFailure = false;
  let parsedBody: unknown;
  let sapArticleNumber: string | undefined;
  let msgType: string | undefined;

  try {
    const parsed = tryParseSapJson(responseText) as {
      Status?: boolean;
      Message?: string;
      MESSAGE?: string;
      MSG_TYP?: string;
      SAP_ART?: string;
    } | undefined;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('SAP response is not valid JSON');
    }

    parsedBody = parsed;

    // Primary integration contract fields from SAP:
    // SAP_ART, MSG_TYP, MESSAGE
    if (typeof parsed?.SAP_ART === 'string' && parsed.SAP_ART.trim()) {
      sapArticleNumber = parsed.SAP_ART.trim();
    }

    if (typeof parsed?.MSG_TYP === 'string' && parsed.MSG_TYP.trim()) {
      msgType = parsed.MSG_TYP.trim().toUpperCase();
    }

    // Keep full SAP payload in message for complete traceability.
    // We do NOT overwrite message with only parsed MESSAGE/Message fields.

    if (parsed?.Status === false) {
      isBusinessFailure = true;
    }
  } catch {
    // Non-JSON response, keep fallback message
  }

  const lowerMessage = rawResponse.toLowerCase();
  const isUnknownElementError =
    lowerMessage.includes('unknown') &&
    (lowerMessage.includes('element') || lowerMessage.includes('container metadata'));

  sapArticleNumber = sapArticleNumber || extractSapArticleNumber(parsedBody, rawResponse);

  message = buildSapSyncMessage(rawResponse, parsedBody, statusCode, msgType);

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
  const response = await fetch(SAP_SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const responseText = await response.text();
  return parseSapResponse(response.status, responseText);
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
        error instanceof Error
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
