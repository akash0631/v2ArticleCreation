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
import majCatMandatory from '../data/maj-cat-mandatory.json';
import majCatAttributeValues from '../data/maj-cat-attribute-values.json';

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
    { rfc: 'SEASON',                flat: 'season' },
    { rfc: 'ARTICLE_DES1',          flat: 'articleDescription' },
    { rfc: 'PRICE_BAND_CATEGORY',   flat: 'segment' },

    // Fabric – macro / main MVGR
    { rfc: 'M_MAIN_MVGR',           flat: 'impAtrbt2' },         // IMPORTANT ATTRIBUTE
    { rfc: 'M_MACRO_MVGR',          flat: 'macroMvgr' },
    { rfc: 'M_FAB',                 flat: 'weave' },             // F_WEAVE_01
    { rfc: 'M_FAB2',                flat: 'mFab2' },             // F_WEAVE_02
    { rfc: 'M_YARN',                flat: 'yarn1' },             // F_YARN
    { rfc: 'M_YARN_02',             flat: 'mainMvgr' },          // same as M_MAIN_MVGR
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

    // Body
    { rfc: 'M_COLLAR',              flat: 'collar' },
    { rfc: 'M_COLLAR_STYLE',        flat: 'collarStyle' },
    { rfc: 'M_NECK_BAND',           flat: 'neck' },
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
    { rfc: 'M_EMBROIDERY',          flat: 'embroidery' },
    { rfc: 'M_EMB_TYPE',            flat: 'embroideryType' },
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
    // MRP is NOT always-include — only sent when a real value exists (null/empty → skip)
]);

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

// ─── Mandatory-field lookup by major category ─────────────────────────────────

const mandatoryData = majCatMandatory as Record<string, string[]>;

/**
 * Returns the set of RFC field names that are mandatory for a given major category.
 * Tries exact match first, then case-insensitive. Returns null if category unknown
 * (caller should fall back to sending all non-empty fields).
 */
function getMandatoryRfcFields(majorCategory: string | null | undefined): Set<string> | null {
    if (!majorCategory) return null;
    const exact = mandatoryData[majorCategory];
    if (exact) return new Set(exact);
    // Case-insensitive fallback
    const upper = majorCategory.trim().toUpperCase();
    for (const [key, fields] of Object.entries(mandatoryData)) {
        if (key.toUpperCase() === upper) return new Set(fields);
    }
    return null;
}

// ─── Value validation against allowed values ──────────────────────────────────

// Maps RFC field name → column key in maj-cat-attribute-values.json
const RFC_TO_EXCEL_COL: Record<string, string> = {
    M_FAB:                'F_WEAVE_01',
    M_FAB2:               'F_WEAVE_02',
    M_YARN:               'F_YARN',
    M_FINISH:             'F_FINISH',
    M_COMPOSITION:        'F_COMP',
    M_LYCRA:              'F_STRETCH',
    M_GSM:                'F_GSM_GLM',
    M_WEAVE_2:            'F_FABRIC MAIN MVGR-02',
    M_COLLAR:             'COLLAR TYPE',
    M_COLLAR_STYLE:       'COLLAR STYLE',
    M_POCKET:             'POCKET TYPE',
    M_PLACKET:            'PLACKET',
    M_BTM_FOLD:           'BOTTOM FOLD',
    M_NECK_BAND:          'NECK TYPE',
    M_NECK_BAND_STYLE:    'NECK STYLE',
    M_SLEEVES_MAIN_STYLE: 'SLEEVE',
    M_SLEEVE_FOLD:        'SLEEVE FOLD',
    M_FIT:                'FIT',
    M_PATTERN:            'BODY STYLE',
    M_LENGTH:             'LENGTH',
    M_DC_SUB_STYLE:       'DC_TYPE',
    M_DC_SHAPE:           'DC_SHAPE',
    M_BTN_MAIN_MVGR:      'BTN_TYPE',
    M_BTN_CLR:            'BTN_CLR',
    M_ZIP:                'ZIP_TYPE',
    M_ZIP_COL:            'ZIP_CLR',
    M_PATCH_TYPE:         'PATCH_TYPE',
    M_PATCHES:            'PATCH_STYLE',
    M_HTRF_TYPE:          'HTRF_TYPE',
    M_HTRF_STYLE:         'HTRF_STYLE',
    M_EMBROIDERY:         'EMB_STYLE',
    M_EMB_TYPE:           'EMB_TYPE',
    M_EMB_PLACEMENT:      'EMB_PLACEMENT',
    M_PRINT_TYPE:         'PRT_TYPE',
    M_PRINT_PLACEMENT:    'PRT_PLCMNT',
    M_PRINT_STYLE:        'PRT_STYLE',
    M_WASH:               'WASH',
    M_AGE_GROUP:          'AGE GROUP',
    PRICE_BAND_CATEGORY:  'SEGMENT',
};

const attrValues = majCatAttributeValues as Record<string, Record<string, string[]>>;

/**
 * Returns the allowed values for an RFC field within a major category, or null
 * if no validation data is available (unknown field or unknown category).
 */
function getValidValues(majorCategory: string, rfcField: string): string[] | null {
    const col = RFC_TO_EXCEL_COL[rfcField];
    if (!col) return null;
    const catData = attrValues[majorCategory];
    if (!catData) return null;
    const values = catData[col];
    if (!Array.isArray(values) || values.length === 0) return null;
    // Skip columns whose only allowed "value" is the placeholder dash
    if (values.length === 1 && values[0] === '-') return null;
    return values;
}

/**
 * Validates all field values in a built RFC payload against the allowed values
 * for the article's major category.
 * Returns an array of human-readable error strings (empty = all OK).
 */
function validatePayloadValues(
    majorCategory: string,
    payload: Record<string, string>
): string[] {
    const errors: string[] = [];
    for (const [rfcField, value] of Object.entries(payload)) {
        if (!value) continue;
        if (RFC_ALWAYS_INCLUDE.has(rfcField)) continue;
        const validValues = getValidValues(majorCategory, rfcField);
        if (validValues === null) continue;
        const upperVal = value.toUpperCase();
        const isValid = validValues.some(v => v.toUpperCase() === upperVal);
        if (!isValid) {
            const colName = RFC_TO_EXCEL_COL[rfcField] ?? rfcField;
            const MAX_SHOW = 5;
            const shown = validValues.slice(0, MAX_SHOW).join(', ');
            const extra = validValues.length > MAX_SHOW ? ` … +${validValues.length - MAX_SHOW} more` : '';
            errors.push(`• ${colName}: "${value}" is not valid — expected: ${shown}${extra}`);
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
 * - RFC_ALWAYS_INCLUDE fields are always present (even empty).
 * - Optional fields are only included when they are BOTH non-empty AND listed
 *   as mandatory for the article's major category. This prevents AI-extracted
 *   values for irrelevant attributes (e.g. M_FINISH for a category where finish
 *   is not applicable) from being sent to SAP and causing validation errors.
 * - If the major category is unknown (not in the mandatory map), all non-empty
 *   fields are included as before (safe fallback).
 */
function buildRfcPayload(item: FlatItem): Record<string, string> {
    const payload: Record<string, string> = {};
    const mandatoryRfcFields = getMandatoryRfcFields(item.majorCategory as string | null);
    const categoryKnown = mandatoryRfcFields !== null;

    for (const { rfc, flat } of FLAT_TO_RFC) {
        const val = toStr(item[flat]);

        if (RFC_ALWAYS_INCLUDE.has(rfc)) {
            // Always include header fields (even empty)
            payload[rfc] = val;
        } else if (val) {
            // Only include optional fields if:
            // - Category unknown (safe fallback: send everything non-empty)
            // - OR field is explicitly mandatory for this category
            if (!categoryKnown || mandatoryRfcFields!.has(rfc)) {
                payload[rfc] = val;
            }
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

        // ── 2. Build payload ─────────────────────────────────────────────────
        const payload = buildRfcPayload(item);

        console.log(`[ZMM_RFC] Sending article creation request for flat_id=${item.id}`, {
            MC_CD:             payload.MC_CD,
            VENDOR:            payload.VENDOR,
            DSG_NO:            payload.DSG_NO,
            SUB_DIV:           payload.SUB_DIV,
            MRP:               payload.MRP,
            SEASON:            payload.SEASON,
            MVGR_BRAND_VENDOR: payload.MVGR_BRAND_VENDOR,
            G_WEIGHT:          payload.G_WEIGHT,
            M_AGE_GROUP:       payload.M_AGE_GROUP,
        });

        // ── 3. Pre-validate field values against allowed values ───────────────
        const majorCat = toStr(item.majorCategory as string | null);
        if (majorCat) {
            const valErrors = validatePayloadValues(majorCat, payload);
            if (valErrors.length > 0) {
                console.warn(`[ZMM_RFC] ❌ Pre-validation failed for flat_id=${item.id}:`, valErrors);
                results.push({
                    id: item.id,
                    success: false,
                    message: `Validation failed (${valErrors.length} issue${valErrors.length > 1 ? 's' : ''})\n${valErrors.join('\n')}`,
                });
                continue;
            }
        }

        // ── 4. Call SAP RFC ──────────────────────────────────────────────────
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
