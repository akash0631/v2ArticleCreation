/**
 * zmmArtCreationService.ts
 *
 * New SAP RFC integration for Generic Article Creation.
 * Calls ZMM_ART_CREATION_RFC with a JSON body (not form-urlencoded).
 * Maps extractionResultFlat fields → RFC IM_DATA field names.
 *
 * Does NOT modify sapSyncService.ts (old integration preserved as-is).
 */

import { SapSyncItemResult } from './sapSyncService';
import { getMcCodeByMajorCategory, getHsnCodeByMcCode } from '../utils/mcCodeMapper';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

// Division-scoped cache: 'MENS' | 'LADIES' | 'KIDS' → { dbField → string[] }
const _dbValuesCache = new Map<string, Record<string, string[]>>();

// ─── Mandatory Grid cache (loaded once from DB per process lifetime) ──────────
// configured: all major categories that have ANY row in maj_cat_mandatory_grid
// active:     majorCategory → Set<rfcSapKey> that are is_active=true
type MandatoryGridCache = {
    configured: Set<string>;
    active: Map<string, Set<string>>;
};
let _mandatoryGridCache: MandatoryGridCache | null = null;

async function loadMandatoryGridForRfc(): Promise<MandatoryGridCache> {
    if (_mandatoryGridCache) return _mandatoryGridCache;

    const rows = await prisma.$queryRaw<
        { major_category: string; sap_key: string; is_active: boolean }[]
    >`SELECT major_category, sap_key, is_active FROM maj_cat_mandatory_grid`;

    const configured = new Set<string>();
    const active = new Map<string, Set<string>>();

    for (const row of rows) {
        configured.add(row.major_category);
        if (row.is_active) {
            if (!active.has(row.major_category)) active.set(row.major_category, new Set());
            active.get(row.major_category)!.add(row.sap_key);
        }
    }

    _mandatoryGridCache = { configured, active };
    console.log(`[ZMM_RFC] Mandatory grid loaded: ${configured.size} major categories configured`);
    return _mandatoryGridCache;
}

/** Call this after an Admin mandatory-grid upload to force a reload on next RFC call. */
export function invalidateMandatoryGridCache(): void {
    _mandatoryGridCache = null;
}

async function getDbValues(division: string): Promise<Record<string, string[]>> {
    const div = division.trim().toUpperCase();
    if (_dbValuesCache.has(div)) return _dbValuesCache.get(div)!;
    const rows = await prisma.sapAttributeValue.findMany({
        where: { majorCategory: div, isActive: true },
        select: { value: true, fieldConfig: { select: { dbField: true } } },
    });
    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
        const key = row.fieldConfig.dbField;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row.value);
    }
    _dbValuesCache.set(div, grouped);
    return grouped;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const ZMM_RFC_URL = 'https://routemaster.v2retail.com:9010/api/ZMM_ART_CREATION_RFC';

const ZMM_RFC_ENABLED =
    (process.env.ZMM_RFC_ENABLED ?? process.env.SAP_SYNC_ENABLED ?? 'true').toLowerCase() === 'true';

// ─── Types ───────────────────────────────────────────────────────────────────

type FlatItem = { id: string; [key: string]: unknown };

type RfcResponse = {
    SAP_ART?: string;
    MSG_TYP?: string;
    MESSAGE?: string;
    Status?: boolean;
    [key: string]: unknown;
};

// ─── Field Mapping: extractionResultFlat (camelCase) → RFC JSON key ──────────
//
// Order matches the RFC IM_DATA structure from the provided curl reference.
// RFC keys that have no DB equivalent are sent as "" so SAP sees a valid field.

const FLAT_TO_RFC: Array<{ rfc: string; flat: string }> = [
    // Header / identity
    { rfc: 'HSN_CODE',              flat: 'hsnTaxCode' },
    { rfc: 'SUB_DIV',               flat: 'subDivision' },       // MS-U / MS-L / LS-U etc.
    { rfc: 'MC_CD',                 flat: 'mcCode' },
    { rfc: 'VENDOR',                flat: 'vendorCode' },
    { rfc: 'DSG_NO',                flat: 'designNumber' },
    { rfc: 'MRP',                   flat: 'mrp' },
    { rfc: 'PURCH_PRICE',          flat: 'rate' },
    { rfc: 'SEASON',                flat: 'season' },
    { rfc: 'ARTICLE_DES1',          flat: 'articleDescription' },
    { rfc: 'PRICE_BAND_CATEGORY',   flat: 'segment' },

    // Fabric – macro / main MVGR
    { rfc: 'M_MAIN_MVGR',           flat: 'impAtrbt2' },         // IMPORTANT ATTRIBUTE
    { rfc: 'M_MACRO_MVGR',          flat: 'macroMvgr' },
    { rfc: 'M_FAB',                 flat: 'weave' },             // F_WEAVE_01
    { rfc: 'M_FAB2',                flat: 'mFab2' },             // F_WEAVE_02
    { rfc: 'M_YARN',                flat: 'yarn1' },             // F_YARN
    { rfc: 'M_YARN-02',             flat: 'mainMvgr' },          // FAB_MAIN_MVGR-1
    { rfc: 'M_WEAVE_2',             flat: 'fabricMainMvgr' },    // F_FABRIC MAIN MVGR-02
    { rfc: 'M_COMPOSITION',         flat: 'composition' },
    { rfc: 'M_FINISH',              flat: 'finish' },
    { rfc: 'M_CONSTRUCTION',        flat: 'fConstruction' },
    { rfc: 'M_SHADE',               flat: 'shade' },
    { rfc: 'M_LYCRA',               flat: 'lycra' },
    { rfc: 'M_GSM',                 flat: 'gsm' },
    { rfc: 'M_COUNT',               flat: 'fCount' },
    { rfc: 'M_OUNZ',                flat: 'fOunce' },
    { rfc: 'M_WIDTH',               flat: 'fWidth' },
    { rfc: 'M_FAB_DIV',             flat: 'fabDiv' },

    // Body
    { rfc: 'M_COLLAR',              flat: 'collar' },
    { rfc: 'M_COLLAR_STYLE',        flat: 'collarStyle' },
    { rfc: 'M_NECK_BAND',            flat: 'neck' },
    { rfc: 'M_NECK_BAND_STYLE',     flat: 'neckDetails' },
    { rfc: 'M_PLACKET',             flat: 'placket' },
    { rfc: 'M_BLT_MAIN_STYLE',      flat: 'fatherBelt' },
    { rfc: 'M_SUB_STYLE_BLT',       flat: 'childBelt' },
    { rfc: 'M_SLEEVES_MAIN_STYLE',  flat: 'sleeve' },
    { rfc: 'M_SLEEVE_FOLD',         flat: 'sleeveFold' },
    { rfc: 'M_BTM_FOLD',            flat: 'bottomFold' },
    { rfc: 'M_FO_BTN_STYLE',        flat: 'frontOpenStyle' },
    { rfc: 'NO_OF_POCKET',          flat: 'noOfPocket' },
    { rfc: 'M_NO_OF_POCKET',        flat: 'noOfPocket' },
    { rfc: 'M_POCKET',              flat: 'pocketType' },
    { rfc: 'M_EXTRA_POCKET',        flat: 'extraPocket' },
    { rfc: 'M_FIT',                 flat: 'fit' },
    { rfc: 'M_PATTERN',             flat: 'pattern' },
    { rfc: 'M_LENGTH',              flat: 'length' },

    // VA Accessories
    { rfc: 'M_DC_SUB_STYLE',        flat: 'drawcord' },
    { rfc: 'M_DC_SHAPE',            flat: 'dcShape' },
    { rfc: 'M_BTN_MAIN_MVGR',       flat: 'button' },
    { rfc: 'M_BTN_CLR',             flat: 'btnColour' },
    { rfc: 'M_ZIP',                 flat: 'zipper' },
    { rfc: 'M_ZIP_COL',             flat: 'zipColour' },
    { rfc: 'M_PATCHES',             flat: 'patches' },
    { rfc: 'M_PATCH_TYPE',          flat: 'patchesType' },
    { rfc: 'M_HTRF_TYPE',           flat: 'htrfType' },
    { rfc: 'M_HTRF_STYLE',          flat: 'htrfStyle' },

    // VA Processing
    { rfc: 'M_PRINT_TYPE',          flat: 'printType' },
    { rfc: 'M_PRINT_PLACEMENT',     flat: 'printPlacement' },
    { rfc: 'M_PRINT_STYLE',         flat: 'printStyle' },
    { rfc: 'M_EMB_TYPE',            flat: 'embroidery' },
    { rfc: 'M_EMBROIDERY',          flat: 'embroideryType' },
    { rfc: 'M_EMB_PLACEMENT',       flat: 'embPlacement' },
    { rfc: 'M_WASH',                flat: 'wash' },

    // Business / segment
    { rfc: 'M_AGE_GROUP',           flat: 'ageGroup' },
    { rfc: 'MVGR_BRAND_VENDOR',     flat: 'mvgrBrandVendor' },
    { rfc: 'G_WEIGHT',              flat: 'weight' },
];

// RFC fields that should always be present (even as empty string) per the RFC contract
const RFC_ALWAYS_INCLUDE = new Set([
    'HSN_CODE', 'SUB_DIV', 'MC_CD', 'VENDOR', 'DSG_NO',
    'SEASON', 'ARTICLE_DES1',
]);

const RFC_INCLUDE_IF_PRESENT = new Set(['MRP', 'PURCH_PRICE']);

// ─── Mandatory field validation ───────────────────────────────────────────────

const MANDATORY: Array<{ flat: string; label: string }> = [
    { flat: 'vendorCode',    label: 'Vendor Code' },
    { flat: 'mcCode',        label: 'MC Code' },
    { flat: 'designNumber',  label: 'Design Number' },
    { flat: 'macroMvgr',     label: 'Macro MVGR' },
    { flat: 'mainMvgr',      label: 'Main MVGR' },
    { flat: 'mrp',           label: 'MRP' },
    { flat: 'impAtrbt2',     label: 'Important Attribute (M_MAIN_MVGR)' },
];

// ─── Value validation against allowed values ──────────────────────────────────

// Maps RFC field name → DB field name in sap_attribute_value table
const RFC_TO_DB_FIELD: Record<string, string> = {
    M_FAB:                'weave',
    M_FAB2:               'mFab2',
    M_YARN:               'yarn1',
    M_FINISH:             'finish',
    M_COMPOSITION:        'composition',
    M_LYCRA:              'lycra',
    M_GSM:                'gsm',
    M_WEAVE_2:            'fabricMainMvgr',
    M_COLLAR:             'collar',
    M_COLLAR_TYPE:        'collar',
    M_COLLAR_STYLE:       'collarStyle',
    M_POCKET:             'pocketType',
    M_PLACKET:            'placket',
    M_BTM_FOLD:           'bottomFold',
    M_NECK_TYPE:          'neck',
    M_NECK_BAND:          'neck',           // legacy alias
    M_NECK_STYLE:         'neckDetails',
    M_NECK_BAND_STYLE:    'neckDetails',    // legacy alias
    M_SLEEVES_MAIN_STYLE: 'sleeve',
    M_SLEEVE_FOLD:        'sleeveFold',
    M_FIT:                'fit',
    M_PATTERN:            'pattern',
    M_LENGTH:             'length',
    M_DC_SUB_STYLE:       'drawcord',
    M_DC_STYLE:           'drawcord',
    M_DC_SHAPE:           'dcShape',
    M_BTN_MAIN_MVGR:      'button',
    M_BTN_TYPE:           'button',
    M_BTN_CLR:            'btnColour',
    M_ZIP:                'zipper',
    M_ZIP_TYPE:           'zipper',
    M_ZIP_COL:            'zipColour',
    M_PATCH_TYPE:         'patchesType',
    M_PATCHES:            'patches',
    M_PATCH_STYLE:        'patches',
    M_PATCHE_TYPE:        'patchesType',
    M_HTRF_TYPE:          'htrfType',
    M_HTRF_STYLE:         'htrfStyle',
    M_EMBROIDERY:         'embroidery',
    M_EMB_TYPE:           'embroideryType',
    M_EMB_PLACEMENT:      'embPlacement',
    M_PRINT_TYPE:         'printType',
    M_PRINT_PLACEMENT:    'printPlacement',
    M_PRINT_STYLE:        'printStyle',
    M_WASH:               'wash',
    M_AGE_GROUP:          'ageGroup',
    PRICE_BAND_CATEGORY:  'segment',
    M_FAB_DIV:            'fabDiv',
};

/**
 * Validates all field values in a built RFC payload against the allowed values
 * from the DB (sap_attribute_value), scoped to the article's division.
 * Returns an array of human-readable error strings (empty = all OK).
 */
async function validatePayloadValues(
    division: string,
    payload: Record<string, string>
): Promise<string[]> {
    const errors: string[] = [];
    const dbValues = await getDbValues(division);

    for (const [rfcField, value] of Object.entries(payload)) {
        if (!value) continue;
        if (RFC_ALWAYS_INCLUDE.has(rfcField)) continue;
        const dbField = RFC_TO_DB_FIELD[rfcField];
        if (!dbField) continue;
        const validValues = dbValues[dbField];
        if (!validValues || validValues.length === 0) continue;
        if (validValues.length === 1 && validValues[0] === '-') continue;
        const upperVal = value.toUpperCase();
        const isValid = validValues.some(v => v.toUpperCase() === upperVal);
        if (!isValid) {
            const MAX_SHOW = 5;
            const shown = validValues.slice(0, MAX_SHOW).join(', ');
            const extra = validValues.length > MAX_SHOW ? ` … +${validValues.length - MAX_SHOW} more` : '';
            errors.push(`• ${rfcField}: "${value}" is not valid — expected: ${shown}${extra}`);
        }
    }
    return errors;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toStr = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    // Prisma Decimal objects (decimal.js) — convert via toNumber() to get a clean numeric string
    if (typeof v === 'object' && typeof (v as any).toNumber === 'function') {
        const n: number = (v as any).toNumber();
        return isNaN(n) ? '' : String(n);
    }
    const s = String(v).trim();
    return s === '-' ? '' : s;  // dash = frontend placeholder, send empty to SAP
};

/**
 * Build the JSON body for ZMM_ART_CREATION_RFC.
 *
 * Field inclusion rules (in priority order):
 *  1. RFC_ALWAYS_INCLUDE fields → always sent (even empty) — header/identity fields.
 *  2. Major category IS configured in the mandatory grid:
 *       → Only send optional fields whose SAP key has is_active=true in the grid
 *         AND the value is non-empty.
 *       → Fields with is_active=false (or not listed) are excluded even if filled.
 *  3. Major category NOT in the mandatory grid (no rows uploaded yet):
 *       → Send all non-empty fields (safe fallback — same as before the grid upload).
 */
function buildRfcPayload(item: FlatItem, mandatoryGrid: MandatoryGridCache): Record<string, string> {
    const majorCategory = toStr(item.majorCategory);
    const isCategoryConfigured = mandatoryGrid.configured.has(majorCategory);
    const activeKeys = mandatoryGrid.active.get(majorCategory);

    const payload: Record<string, string> = {};

    for (const { rfc, flat } of FLAT_TO_RFC) {
        const val = toStr(item[flat]);

        if (RFC_ALWAYS_INCLUDE.has(rfc)) {
            // Rule 1: header fields always go through
            payload[rfc] = val;
        } else if (val) {
            if (!isCategoryConfigured) {
                // Rule 3: major category not in mandatory grid → send all non-empty (fallback)
                payload[rfc] = val;
            } else if (activeKeys?.has(rfc)) {
                // Rule 2: category configured AND this SAP key is active (is_active=true)
                payload[rfc] = val;
            }
            // else: category configured but this SAP key is inactive (0/empty in Excel) → skip
        }
    }

    // Always re-derive MC_CD and HSN_CODE from majorCategory using the JSON source of truth.
    // Both DB fields (mcCode, hsnTaxCode) can be stale if set at extraction time with an old mapping.
    const freshMcCode = getMcCodeByMajorCategory(item.majorCategory as string | null);
    if (freshMcCode) {
        payload['MC_CD'] = freshMcCode;
        const freshHsn = getHsnCodeByMcCode(freshMcCode);
        if (freshHsn) {
            payload['HSN_CODE'] = freshHsn;
        }
    }

    return payload;
}

// ─── SAP response parsing ─────────────────────────────────────────────────────

/**
 * Parse the RFC JSON response and return a normalised outcome.
 * SAP is expected to return: { SAP_ART, MSG_TYP, MESSAGE }
 * MSG_TYP: S = success, E = error, W = warning, I = info
 */
function parseRfcResponse(
    statusCode: number,
    body: string
): { ok: boolean; sapArticleNumber?: string; message: string } {
    let parsed: RfcResponse | undefined;

    try {
        parsed = JSON.parse(body) as RfcResponse;
    } catch {
        // Non-JSON plain-text response
        return {
            ok: false,
            message: body.trim() || `SAP returned HTTP ${statusCode} with no body`,
        };
    }

    // Support multiple SAP response key formats
    const sapArt = toStr(parsed?.SAP_ART ?? parsed?.ArticleNumber ?? parsed?.ARTICLE_NUMBER ?? parsed?.artNo);
    const msgTyp = toStr(parsed?.MSG_TYP ?? parsed?.MsgType ?? parsed?.TYPE ?? parsed?.type ?? '').toUpperCase();
    const msgText = toStr(parsed?.MESSAGE ?? parsed?.Message ?? parsed?.message ?? parsed?.MSG ?? parsed?.msg ?? parsed?.error ?? parsed?.Error ?? '');
    const statusFlag = parsed?.Status ?? parsed?.status ?? parsed?.SUCCESS ?? parsed?.success;

    // Log parsed fields to help debug
    console.log(`[ZMM_RFC] Parsed → SAP_ART="${sapArt}" MSG_TYP="${msgTyp}" MESSAGE="${msgText}" Status="${statusFlag}" | Full keys: ${Object.keys(parsed || {}).join(', ')}`);

    // Build readable message
    const messageParts: string[] = [];
    if (msgTyp)  messageParts.push(`[${msgTyp}]`);
    if (msgText) messageParts.push(msgText);
    const message = messageParts.join(' ') || (sapArt ? `Article created: ${sapArt}` : `SAP response HTTP ${statusCode} — ${JSON.stringify(parsed)}`);

    // Determine success:
    // - HTTP 2xx AND
    // - Status !== false AND
    // - MSG_TYP not 'E' (error)
    const isHttpOk = statusCode >= 200 && statusCode < 300;
    const isStatusOk = statusFlag !== false && statusFlag !== 'false' && statusFlag !== 0 && statusFlag !== '0';
    const isBusinessOk = isStatusOk && msgTyp !== 'E' && msgTyp !== 'ERROR';
    // If SAP_ART is present, treat as success regardless
    const ok = isHttpOk && (sapArt ? true : isBusinessOk);

    return {
        ok,
        sapArticleNumber: sapArt || undefined,
        message,
    };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Calls ZMM_ART_CREATION_RFC (JSON endpoint) for each approved item.
 * Returns the same SapSyncItemResult[] shape so the ApproverController
 * can treat this identically to the old syncApprovedItemsToSap.
 */
export async function syncArticlesToSapViaRfc(
    items: FlatItem[]
): Promise<SapSyncItemResult[]> {
    if (!ZMM_RFC_ENABLED) {
        console.log('[ZMM_RFC] Disabled via ZMM_RFC_ENABLED / SAP_SYNC_ENABLED env var');
        return items.map((item) => ({
            id: item.id,
            success: false,
            message: 'ZMM_ART_CREATION_RFC sync is disabled',
        }));
    }

    const results: SapSyncItemResult[] = [];

    // Load mandatory grid once for the entire batch (cached after first call)
    const mandatoryGrid = await loadMandatoryGridForRfc();

    for (const item of items) {
        // ── 1. Mandatory field check ──────────────────────────────────────────
        const missing = MANDATORY.filter((f) => {
            const val = toStr(item[f.flat]);
            // For MRP specifically, also reject zero value
            if (f.flat === 'mrp') return !val || val === '0';
            return !val;
        });
        if (missing.length > 0) {
            results.push({
                id: item.id,
                success: false,
                message: `Missing mandatory fields: ${missing.map((f) => f.label).join(', ')}`,
            });
            continue;
        }

        // ── 2. Build payload (filtered by mandatory grid) ─────────────────────
        const payload = buildRfcPayload(item, mandatoryGrid);

        console.log(`\n========== [ZMM_RFC] FULL PAYLOAD for flat_id=${item.id} ==========`);
        console.log(`API URL : ${ZMM_RFC_URL}`);
        console.log(JSON.stringify(payload, null, 2));
        console.log(`====================================================================\n`);

        // ── 3. Call SAP RFC ──────────────────────────────────────────────────
        try {
            const response = await fetch(ZMM_RFC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const responseText = await response.text();

            // Log full raw SAP response so we can see exactly what SAP returns
            console.log(`[ZMM_RFC] RAW SAP response (status=${response.status}) for flat_id=${item.id}:`, responseText);

            const outcome = parseRfcResponse(response.status, responseText);

            if (outcome.ok) {
                console.log(
                    `[ZMM_RFC] ✅ Article created: ${outcome.sapArticleNumber ?? 'no article number'} for flat_id=${item.id}`
                );
                results.push({
                    id: item.id,
                    success: true,
                    statusCode: response.status,
                    message: outcome.message,
                    sapArticleNumber: outcome.sapArticleNumber,
                });
            } else {
                console.warn(`[ZMM_RFC] ❌ SAP rejected flat_id=${item.id}: ${outcome.message}`);
                results.push({
                    id: item.id,
                    success: false,
                    statusCode: response.status,
                    message: outcome.message,
                });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown network error';
            console.error(`[ZMM_RFC] Network error for flat_id=${item.id}:`, msg);
            results.push({
                id: item.id,
                success: false,
                message: `ZMM_ART_CREATION_RFC network error: ${msg}`,
            });
        }
    }

    return results;
}
