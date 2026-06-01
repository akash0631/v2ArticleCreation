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

// The mandatory-grid Excel template uses some human-readable column names in Row 3
// that differ from the RFC parameter names used in FLAT_TO_RFC.
// This map normalises grid SAP keys → RFC keys so the filter works correctly.
const GRID_KEY_TO_RFC: Record<string, string> = {
    'AGE GROUP':           'M_AGE_GROUP',
    'SEGMENT':             'PRICE_BAND_CATEGORY',
    'COST':                'PURCH_PRICE',
    'ARTICLE FASHION TYPE':'FASHION_GRADE',
    'ARTICLE WEIGHT':      'G_WEIGHT',
    'BODY STYLE':          'M_BODY_STYLE', // Excel uses "BODY STYLE", RFC uses "M_BODY_STYLE"
    // M_* keys already match FLAT_TO_RFC exactly — no entry needed
};

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
            // Normalise grid key → RFC key (handles display-name mismatches)
            const rfcKey = GRID_KEY_TO_RFC[row.sap_key] ?? row.sap_key;
            if (!active.has(row.major_category)) active.set(row.major_category, new Set());
            active.get(row.major_category)!.add(rfcKey);
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

// ─── Maj-Cat Grid Visible Fields cache ────────────────────────────────────────
// Maps attribute_name stored in maj_cat_grid_values → RFC key(s) in FLAT_TO_RFC.
// Many Excel names differ from the RFC parameter name — this is the bridge.
const EXCEL_ATTR_TO_RFC: Record<string, string[]> = {
    // ── Fabric (new attribute_name values stored in maj_cat_grid_values) ──────
    'M_FAB_DIV':            ['M_FAB_DIV'],
    'M_YARN':               ['M_YARN'],
    'M_FAB_MAIN_MVGR_1':    ['M_FAB_MAIN_MVGR_1'],   // replaces old 'FAB_MAIN_MVGR-1'
    'M_FAB_MAIN_MVGR_2':    ['M_FAB_MAIN_MVGR_2'],   // replaces old 'FAB-MAIN-MVGR-2'
    'M_WEAVE_01':           ['M_WEAVE_01'],            // replaces old 'WEAVE-01'
    'M_WEAVE_02':           ['M_WEAVE_02'],            // replaces old 'WEAVE 02'
    'M_IMP_ATBT':           ['M_IMP_ATBT'],
    'M_FAB_VDR':            ['M_FAB_VDR'],
    'M_COMPOSITION':        ['M_COMPOSITION'],
    'M_FINISH':             ['M_FINISH'],
    'M_CONSTRUCTION':       ['M_CONSTRUCTION'],
    'M_LYCRA':              ['M_LYCRA'],
    'M_GSM':                ['M_GSM'],
    'M_OUNZ':               ['M_OUNZ'],
    'M_WIDTH':              ['M_WIDTH'],
    'M_COUNT':              ['M_COUNT'],
    // ── Body ─────────────────────────────────────────────────────────────────
    'M_COLLAR_TYPE':        ['M_COLLAR_TYPE'],
    'M_COLLAR_STYLE':       ['M_COLLAR_STYLE'],
    'M_NECK_TYPE':          ['M_NECK_TYPE'],
    'M_NECK_STYLE':         ['M_NECK_STYLE'],
    'M_PLACKET':            ['M_PLACKET'],
    'M_BLT_TYPE':           ['M_BLT_TYPE'],
    'M_BLT_STYLE':          ['M_BLT_STYLE'],
    'M_SLEEVES_MAIN_STYLE': ['M_SLEEVES_MAIN_STYLE'],
    'M_SLEEVE_FOLD':        ['M_SLEEVE_FOLD'],
    'M_BTM_FOLD':           ['M_BTM_FOLD'],
    'M_NO_OF_POCKET':       ['M_NO_OF_POCKET'],
    'M_POCKET':             ['M_POCKET'],
    'M_EXTRA_POCKET':       ['M_EXTRA_POCKET'],
    'M_FIT':                ['M_FIT'],
    'M_BODY_STYLE':         ['M_BODY_STYLE'],          // replaces old 'BODY STYLE' → 'M_PATTERN'
    'M_LENGTH':             ['M_LENGTH'],
    // ── VA Accessories ────────────────────────────────────────────────────────
    'M_DC_STYLE':           ['M_DC_STYLE'],
    'M_DC_SHAPE':           ['M_DC_SHAPE'],
    'M_BTN_TYPE':           ['M_BTN_TYPE'],
    'M_BTN_CLR':            ['M_BTN_CLR'],
    'M_ZIP_TYPE':           ['M_ZIP_TYPE'],
    'M_ZIP_COL':            ['M_ZIP_COL'],
    'M_PATCHE_TYPE':        ['M_PATCHE_TYPE'],
    'M_PATCH_STYLE':        ['M_PATCH_STYLE'],
    'M_HTRF_TYPE':          ['M_HTRF_TYPE'],
    'M_HTRF_STYLE':         ['M_HTRF_STYLE'],
    // ── VA Processing ─────────────────────────────────────────────────────────
    'M_PRINT_TYPE':         ['M_PRINT_TYPE'],
    'M_PRINT_STYLE':        ['M_PRINT_STYLE'],
    'M_PRINT_PLACEMENT':    ['M_PRINT_PLACEMENT'],
    'M_EMB_TYPE':           ['M_EMB_TYPE'],
    'M_EMBROIDERY_STYLE':   ['M_EMBROIDERY_STYLE'],
    'M_EMB_PLACEMENT':      ['M_EMB_PLACEMENT'],
    'M_WASH':               ['M_WASH'],
    // ── Business ──────────────────────────────────────────────────────────────
    'M_AGE_GROUP':          ['M_AGE_GROUP'],
    // Legacy / old attribute_name aliases (kept for backward compat)
    'AGE GROUP':            ['M_AGE_GROUP'],
    'BODY STYLE':           ['M_BODY_STYLE'],
    'FAB_MAIN_MVGR-1':      ['M_FAB_MAIN_MVGR_1'],
    'FAB-MAIN-MVGR-2':      ['M_FAB_MAIN_MVGR_2'],
    'WEAVE-01':             ['M_WEAVE_01'],
    'WEAVE 02':             ['M_WEAVE_02'],
};

// majorCategory → Set<rfcKey> derived from maj_cat_grid_values (Tier 2 visible fields)
type MajCatVisibleFields = Map<string, Set<string>>;
let _majCatVisibleCache: MajCatVisibleFields | null = null;

/**
 * Load which RFC keys are visible (Tier 2) per major category from maj_cat_grid_values.
 * A field is Tier 2 visible if maj_cat_grid_values has at least one row for
 * (major_category, attribute_name). Cached for the process lifetime.
 */
async function loadMajCatVisibleFieldsForRfc(): Promise<MajCatVisibleFields> {
    if (_majCatVisibleCache) return _majCatVisibleCache;

    const rows = await prisma.$queryRaw<
        { major_category: string; attribute_name: string }[]
    >`SELECT DISTINCT major_category, attribute_name FROM maj_cat_grid_values`;

    const map = new Map<string, Set<string>>();
    for (const row of rows) {
        const rfcKeys = EXCEL_ATTR_TO_RFC[row.attribute_name];
        if (!rfcKeys) continue;
        if (!map.has(row.major_category)) map.set(row.major_category, new Set());
        for (const rfc of rfcKeys) map.get(row.major_category)!.add(rfc);
    }

    _majCatVisibleCache = map;
    console.log(`[ZMM_RFC] Maj-cat visible fields loaded: ${map.size} major categories`);
    return map;
}

/** Call this after an Admin maj_cat_grid upload to force a reload on next RFC call. */
export function invalidateMajCatVisibleCache(): void {
    _majCatVisibleCache = null;
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
    { rfc: 'M_IMP_ATBT',            flat: 'impAtrbt2' },         // IMPORTANT ATTRIBUTE
    { rfc: 'M_WEAVE_01',            flat: 'weave' },             // F_WEAVE_01
    { rfc: 'M_WEAVE_02',            flat: 'mFab2' },             // F_WEAVE_02
    { rfc: 'M_YARN',                flat: 'yarn1' },             // F_YARN
    { rfc: 'M_FAB_MAIN_MVGR_1',    flat: 'mainMvgr' },          // FAB_MAIN_MVGR-1
    { rfc: 'M_FAB_MAIN_MVGR_2',    flat: 'fabricMainMvgr' },    // F_FABRIC MAIN MVGR-02
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
    { rfc: 'M_FAB_VDR',             flat: 'fabVdr' },

    // Body
    { rfc: 'M_COLLAR_TYPE',         flat: 'collar' },
    { rfc: 'M_COLLAR_STYLE',        flat: 'collarStyle' },
    { rfc: 'M_NECK_TYPE',           flat: 'neck' },
    { rfc: 'M_NECK_STYLE',          flat: 'neckDetails' },
    { rfc: 'M_PLACKET',             flat: 'placket' },
    { rfc: 'M_BLT_TYPE',            flat: 'fatherBelt' },
    { rfc: 'M_BLT_STYLE',           flat: 'childBelt' },
    { rfc: 'M_SLEEVES_MAIN_STYLE',  flat: 'sleeve' },
    { rfc: 'M_SLEEVE_FOLD',         flat: 'sleeveFold' },
    { rfc: 'M_BTM_FOLD',            flat: 'bottomFold' },
    { rfc: 'M_NO_OF_POCKET',        flat: 'noOfPocket' },
    { rfc: 'M_POCKET',              flat: 'pocketType' },
    { rfc: 'M_EXTRA_POCKET',        flat: 'extraPocket' },
    { rfc: 'M_FIT',                 flat: 'fit' },
    { rfc: 'M_BODY_STYLE',          flat: 'pattern' },
    { rfc: 'M_LENGTH',              flat: 'length' },

    // VA Accessories
    { rfc: 'M_DC_STYLE',            flat: 'drawcord' },
    { rfc: 'M_DC_SHAPE',            flat: 'dcShape' },
    { rfc: 'M_BTN_TYPE',            flat: 'button' },
    { rfc: 'M_BTN_CLR',             flat: 'btnColour' },
    { rfc: 'M_ZIP_TYPE',            flat: 'zipper' },
    { rfc: 'M_ZIP_COL',             flat: 'zipColour' },
    { rfc: 'M_PATCHE_TYPE',         flat: 'patches' },
    { rfc: 'M_PATCH_STYLE',         flat: 'patchesType' },
    { rfc: 'M_HTRF_TYPE',           flat: 'htrfType' },
    { rfc: 'M_HTRF_STYLE',          flat: 'htrfStyle' },

    // VA Processing
    { rfc: 'M_PRINT_TYPE',          flat: 'printType' },
    { rfc: 'M_PRINT_PLACEMENT',     flat: 'printPlacement' },
    { rfc: 'M_PRINT_STYLE',         flat: 'printStyle' },
    { rfc: 'M_EMB_TYPE',            flat: 'embroidery' },
    { rfc: 'M_EMBROIDERY_STYLE',    flat: 'embroideryType' },
    { rfc: 'M_EMB_PLACEMENT',       flat: 'embPlacement' },
    { rfc: 'M_WASH',                flat: 'wash' },

    // Business / segment
    { rfc: 'M_AGE_GROUP',           flat: 'ageGroup' },
    { rfc: 'FASHION_GRADE',         flat: 'articleFashionType' },
    { rfc: 'G_WEIGHT',              flat: 'weight' },
];

// RFC fields that should always be present (even as empty string) per the RFC contract
const RFC_ALWAYS_INCLUDE = new Set([
    'HSN_CODE', 'SUB_DIV', 'MC_CD', 'VENDOR', 'DSG_NO',
    'SEASON', 'ARTICLE_DES1',
]);

// RFC keys that are always sent to SAP if non-empty, regardless of grid visibility.
// These correspond to:
//   BOM fields  — always shown in the article card BOM section
//   freeText fields — always shown in the article card regardless of major category
const RFC_ALWAYS_SEND_IF_PRESENT = new Set([
    // BOM (always visible in card)
    'MRP',
    'PURCH_PRICE',
    'M_IMP_ATBT',          // IMP_ATBT
    // freeText fields (always visible in card, no dropdown filtering)
    'M_SHADE',             // shade
    'G_WEIGHT',            // weight
    'PRICE_BAND_CATEGORY', // segment
    'FASHION_GRADE',       // articleFashionType
]);

// ─── Mandatory field validation ───────────────────────────────────────────────

const MANDATORY: Array<{ flat: string; label: string }> = [
    { flat: 'vendorCode',    label: 'Vendor Code' },
    { flat: 'mcCode',        label: 'MC Code' },
    { flat: 'designNumber',  label: 'Design Number' },
    { flat: 'mainMvgr',      label: 'Main MVGR' },
    { flat: 'mrp',           label: 'MRP' },
    { flat: 'impAtrbt2',     label: 'M_IMP_ATBT' },
];

// ─── Value validation against allowed values ──────────────────────────────────

// Maps RFC field name → DB field name in sap_attribute_value table
const RFC_TO_DB_FIELD: Record<string, string> = {
    M_FAB:                'weave',           // legacy alias
    M_WEAVE_01:           'weave',
    M_FAB2:               'mFab2',           // legacy alias
    M_WEAVE_02:           'mFab2',
    M_YARN:               'yarn1',
    M_FAB_MAIN_MVGR_1:    'mainMvgr',
    M_FAB_MAIN_MVGR_2:    'fabricMainMvgr',
    M_FAB_VDR:            'fabVdr',
    M_FINISH:             'finish',
    M_COMPOSITION:        'composition',
    M_LYCRA:              'lycra',
    M_GSM:                'gsm',
    M_WEAVE_2:            'fabricMainMvgr',  // legacy alias
    M_COLLAR:             'collar',           // legacy alias
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
    M_PATTERN:            'pattern',         // legacy alias
    M_BODY_STYLE:         'pattern',
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
    M_EMBROIDERY:         'embroideryType',   // legacy alias
    M_EMBROIDERY_STYLE:   'embroideryType',
    M_EMB_TYPE:           'embroidery',
    M_EMB_PLACEMENT:      'embPlacement',
    M_PRINT_TYPE:         'printType',
    M_PRINT_PLACEMENT:    'printPlacement',
    M_PRINT_STYLE:        'printStyle',
    M_WASH:               'wash',
    M_AGE_GROUP:          'ageGroup',
    PRICE_BAND_CATEGORY:  'segment',
    M_FAB_DIV:            'fabDiv',
    M_IMP_ATBT:           'impAtrbt2',
    M_MAIN_MVGR:          'impAtrbt2',       // legacy alias
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
 * Mirrors the frontend 3-tier card visibility exactly:
 *
 *  RFC_ALWAYS_INCLUDE          → header/identity fields — always sent (even empty)
 *  RFC_ALWAYS_SEND_IF_PRESENT  → BOM + freeText fields — always sent if non-empty
 *  Tier 1 (mandatory grid)     → is_active=true for this major category → sent if non-empty
 *  Tier 2 (maj_cat_grid)       → has dropdown values for this major category → sent if non-empty
 *  Tier 3 (neither grid)       → NOT sent even if the DB has a value
 */
function buildRfcPayload(
    item: FlatItem,
    mandatoryGrid: MandatoryGridCache,
    majCatVisible: MajCatVisibleFields,
): Record<string, string> {
    const majorCategory = toStr(item.majorCategory);

    // Tier 1: SAP keys that are active (mandatory) for this major category
    const mandatoryKeys = mandatoryGrid.active.get(majorCategory) ?? new Set<string>();
    // Tier 2: SAP keys that have dropdown values for this major category
    const optionalKeys  = majCatVisible.get(majorCategory)        ?? new Set<string>();

    // Union: every RFC key that is visible in the article card
    const visibleKeys = new Set([...mandatoryKeys, ...optionalKeys]);

    const payload: Record<string, string> = {};

    for (const { rfc, flat } of FLAT_TO_RFC) {
        const val = toStr(item[flat]);

        if (RFC_ALWAYS_INCLUDE.has(rfc)) {
            // Header/identity fields — always present (even if empty)
            payload[rfc] = val;
        } else if (val && RFC_ALWAYS_SEND_IF_PRESENT.has(rfc)) {
            // BOM / freeText fields — always sent if the value is non-empty
            payload[rfc] = val;
        } else if (val && visibleKeys.has(rfc)) {
            // Tier 1 or Tier 2 field — visible in card AND has a value
            payload[rfc] = val;
        }
        // Tier 3: not in either grid → skip even if DB has a value
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

    // Load both grids once for the entire batch (cached after first call)
    const mandatoryGrid = await loadMandatoryGridForRfc();
    const majCatVisible = await loadMajCatVisibleFieldsForRfc();

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

        // ── 2. Build payload (filtered by card visibility: mandatory + optional grids) ──
        const payload = buildRfcPayload(item, mandatoryGrid, majCatVisible);

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
