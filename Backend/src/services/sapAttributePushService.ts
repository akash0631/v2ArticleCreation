/**
 * SAP Attribute Push Service
 *
 * After ZMM_ART_CREATION_RFC creates an article (MARA + variants), this
 * service writes the article's characteristic attributes into standard SAP
 * AUSP (KLART=026) via the V64 + link chain:
 *
 *   1. RFC_READ_TABLE MARA -> MATKL   (authoritative class lookup)
 *   2. Z_LINK_MATNR_CLASS              (idempotent class link to MATKL-class)
 *   3. Z_ART_PATCH_RFC_V64             (KSML-aware writer; routes to AUSP)
 *
 * On atomic-fail (V64 returns ok:false because >=1 attr is NIC/LOCKED), the
 * driver filters to PLANNED-only attrs and retries once. Anything still NIC
 * is reported back so the UI/audit can show which attrs were rejected.
 *
 * Replaces the legacy V61/ZCT04 path. CT04 (CABN/KLAH) stays the master
 * catalog maintained by the MDM team; AUSP is the per-object value store.
 */

import { getSapFieldMappings } from './sapSyncService';

export type AttributePushResult = {
  ok: boolean;
  matnr: string;
  matkl?: string;
  writtenCount: number;
  nicCount: number;
  lockedCount: number;
  errorMessage?: string;
  planLog?: Array<{ atnam: string; value: string; status: string; route?: string }>;
};

const SAP_RFC_PROXY_URL =
  process.env.SAP_RFC_PROXY_URL || 'https://sap-api.v2retail.net';

const SAP_RFC_KEY =
  process.env.SAP_RFC_KEY || 'v2-rfc-proxy-2026';

const SAP_ENV = (process.env.SAP_ENV || 'prod').toLowerCase();

const SAP_ATTRIBUTE_PUSH_ENABLED =
  (process.env.SAP_ATTRIBUTE_PUSH_ENABLED || 'true').toLowerCase() === 'true';

const SAP_RFC_USER_AGENT =
  process.env.SAP_RFC_USER_AGENT || 'v2-article-creation/1.0';

const padMatnr = (matnr: string): string => String(matnr || '').trim().padStart(18, '0');

const sapValue = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text ? text : null;
};

type ProxyResponse = {
  ok: boolean;
  status: number;
  body: any;
  rawText: string;
};

const callProxy = async (bapiname: string, body: Record<string, unknown>): Promise<ProxyResponse> => {
  const url = `${SAP_RFC_PROXY_URL.replace(/\/$/, '')}/api/rfc/proxy?env=${SAP_ENV}`;
  const payload = JSON.stringify({ bapiname, ...body });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RFC-Key': SAP_RFC_KEY,
      'User-Agent': SAP_RFC_USER_AGENT,
    },
    body: payload,
  });
  const rawText = await res.text();
  let parsed: any = undefined;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // proxy occasionally returns plain text on hard failures
  }
  return { ok: res.ok, status: res.status, body: parsed, rawText };
};

const fetchMatkl = async (matnr: string): Promise<string | null> => {
  const padded = padMatnr(matnr);
  const res = await callProxy('RFC_READ_TABLE', {
    QUERY_TABLE: 'MARA',
    FIELDS: [{ FIELDNAME: 'MATKL' }],
    OPTIONS: [{ TEXT: `MATNR = '${padded}'` }],
    ROWCOUNT: 1,
    DELIMITER: '^',
  });
  if (!res.ok) return null;

  // Proxy returns SAP-style { DATA: [{ WA: 'matkl_value' }], FIELDS: [...] }
  const dataRows = res.body?.DATA || res.body?.data || res.body?.ET_DATA;
  if (!Array.isArray(dataRows) || dataRows.length === 0) return null;
  const first = dataRows[0];
  const raw = first?.WA ?? first?.wa ?? first?.MATKL ?? first?.matkl;
  const text = sapValue(raw);
  if (!text) return null;
  // strip delimiter padding if present
  return text.split('^')[0].trim() || null;
};

const linkMatnrToClass = async (matnr: string, matkl: string): Promise<{ ok: boolean; message: string }> => {
  const res = await callProxy('Z_LINK_MATNR_CLASS', {
    IV_MATNR: padMatnr(matnr),
    IV_CLASS: matkl,
    IV_KLART: '026',
  });
  if (!res.ok) {
    return { ok: false, message: `Z_LINK_MATNR_CLASS HTTP ${res.status}: ${res.rawText.slice(0, 200)}` };
  }
  // "already linked" returned by FM is treated as success (idempotent)
  const msg = sapValue(res.body?.EV_MESSAGE ?? res.body?.MESSAGE ?? res.body?.message) || '';
  const rc = res.body?.EV_RC ?? res.body?.RC ?? 0;
  if (rc !== 0 && rc !== '0' && !/already.*link/i.test(msg)) {
    return { ok: false, message: msg || `link rc=${rc}` };
  }
  return { ok: true, message: msg || 'linked' };
};

type PlanRow = { atnam: string; value: string; status: string; route?: string };

const parsePlan = (body: any): PlanRow[] => {
  const raw = body?.ET_PLAN ?? body?.plan ?? body?.PLAN ?? body?.ET_RESULT ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((row: any) => ({
    atnam: String(row.ATNAM ?? row.atnam ?? '').trim(),
    value: String(row.VALUE ?? row.value ?? row.ATWRT ?? '').trim(),
    status: String(row.STATUS ?? row.status ?? '').trim().toUpperCase(),
    route: row.ROUTE ?? row.route,
  })).filter((r: PlanRow) => r.atnam);
};

const callV64 = async (matnr: string, ivChanges: string, testMode = ''): Promise<{ ok: boolean; plan: PlanRow[]; raw: any }> => {
  const res = await callProxy('Z_ART_PATCH_RFC_V64', {
    IV_MATNR: padMatnr(matnr),
    IV_CHANGES: ivChanges,
    IV_TEST_MODE: testMode,
  });
  const plan = parsePlan(res.body);
  const okFlag = res.ok && (res.body?.EV_OK === 'X' || res.body?.ok === true || res.body?.OK === true);
  return { ok: !!okFlag, plan, raw: res.body };
};

const buildChangesString = (item: Record<string, unknown>): { changes: string; count: number } => {
  const mappings = getSapFieldMappings();
  const seen = new Set<string>();
  const parts: string[] = [];

  const snakeToCamel = (value: string): string =>
    value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

  for (const m of mappings) {
    const apiName = m.apiName.trim();
    // Only push real characteristic attrs (M_*, NET_WEIGHT, DSG_NO etc). Skip
    // article-master fields handled by ZMM_ART_CREATION_RFC (VENDOR, MC_CD,
    // MAJOR_CATEGORY etc) and anything already routed in buildSapFormBody.
    if (!apiName) continue;
    if (seen.has(apiName)) continue;
    const direct = item[m.attribute];
    const camel = item[snakeToCamel(m.attribute)];
    const value = sapValue(direct ?? camel);
    if (!value) continue;
    seen.add(apiName);
    // V64 IV_CHANGES delimiter is `|` for rows and `=` for key=value
    const safeValue = value.replace(/\|/g, '/').replace(/=/g, '-');
    parts.push(`${apiName}=${safeValue}`);
  }

  return { changes: parts.join('|'), count: parts.length };
};

const tallyPlan = (plan: PlanRow[]) => {
  let writtenCount = 0;
  let nicCount = 0;
  let lockedCount = 0;
  for (const row of plan) {
    const s = row.status.toUpperCase();
    if (s === 'APPLIED' || s === 'PLANNED' || s === 'OK') writtenCount++;
    else if (s === 'NIC') nicCount++;
    else if (s === 'LOCKED' || s === 'REJECT') lockedCount++;
  }
  return { writtenCount, nicCount, lockedCount };
};

export const isAttributePushEnabled = (): boolean => SAP_ATTRIBUTE_PUSH_ENABLED;

export const pushAttributesViaV64 = async (
  matnr: string,
  item: Record<string, unknown>
): Promise<AttributePushResult> => {
  const result: AttributePushResult = {
    ok: false,
    matnr: padMatnr(matnr),
    writtenCount: 0,
    nicCount: 0,
    lockedCount: 0,
  };

  if (!SAP_ATTRIBUTE_PUSH_ENABLED) {
    result.errorMessage = 'attribute push disabled (SAP_ATTRIBUTE_PUSH_ENABLED=false)';
    return result;
  }

  const built = buildChangesString(item);
  if (built.count === 0) {
    result.ok = true;
    result.errorMessage = 'no characteristic attributes to push';
    return result;
  }

  try {
    // Step 1: lookup MATKL authoritatively
    const matkl = await fetchMatkl(matnr);
    if (!matkl) {
      result.errorMessage = 'MATKL lookup failed (RFC_READ_TABLE MARA returned no row)';
      return result;
    }
    result.matkl = matkl;

    // Step 2: link matnr to MATKL-class (idempotent)
    const link = await linkMatnrToClass(matnr, matkl);
    if (!link.ok) {
      result.errorMessage = `class link failed: ${link.message}`;
      return result;
    }

    // Step 3: V64 write
    const first = await callV64(matnr, built.changes, '');
    result.planLog = first.plan;

    if (first.ok) {
      const tally = tallyPlan(first.plan);
      result.ok = true;
      result.writtenCount = tally.writtenCount;
      result.nicCount = tally.nicCount;
      result.lockedCount = tally.lockedCount;
      return result;
    }

    // Atomic-fail path: filter to PLANNED-only and retry once
    const planned = first.plan.filter((p) => p.status === 'PLANNED');
    if (planned.length > 0) {
      const filtered = planned.map((p) => `${p.atnam}=${p.value}`).join('|');
      const second = await callV64(matnr, filtered, '');
      result.planLog = second.plan;
      const tally = tallyPlan(second.plan);
      result.ok = second.ok;
      result.writtenCount = tally.writtenCount;
      result.nicCount = (first.plan.length - planned.length) + tally.nicCount;
      result.lockedCount = tally.lockedCount;
      if (!second.ok) {
        result.errorMessage = `V64 retry returned ok:false (${tally.writtenCount} written, ${tally.nicCount} nic)`;
      }
      return result;
    }

    const tally = tallyPlan(first.plan);
    result.writtenCount = 0;
    result.nicCount = tally.nicCount;
    result.lockedCount = tally.lockedCount;
    result.errorMessage = `V64 atomic-fail: 0 PLANNED, ${tally.nicCount} NIC, ${tally.lockedCount} LOCKED`;
    return result;
  } catch (err) {
    result.errorMessage = err instanceof Error ? err.message : 'unknown V64 push error';
    return result;
  }
};
