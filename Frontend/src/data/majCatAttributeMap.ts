import majCatMandatory from './archived/maj-cat-mandatory.json';
import { MAJOR_CATEGORY_ALLOWED_VALUES } from './majorCategoryMap';
import { getCachedValues, getCachedCategoryAttributes } from '../services/articleConfigService';

/**
 * Maps frontend schema keys to Excel CHILD_MAJ_CAT attribute names.
 * Used to filter allowed values per major category from maj-cat-attribute-values.json.
 */
export const SCHEMA_KEY_TO_EXCEL_ATTR: Record<string, string> = {
  macro_mvgr:        'IMP ATBT-1',
  main_mvgr:         'FAB_MAIN_MVGR-1',
  yarn_01:           'M_YARN',
  fabric_main_mvgr:  'FAB-MAIN-MVGR-2',
  weave:             'WEAVE 01',
  m_fab2:            'WEAVE 02',
  composition:       'M_COMPOSITION',
  finish:            'M_FINISH',
  gsm:               'M_GSM',
  lycra_non_lycra:   'M_LYCRA',
  collar:            'M_COLLAR_TYPE',
  collar_style:      'M_COLLAR_STYLE',
  placket:           'M_PLACKET',
  sleeve:            'M_SLEEVES_MAIN_STYLE',
  sleeve_fold:       'M_SLEEVE_FOLD',
  bottom_fold:       'M_BTM_FOLD',
  neck:              'M_NECK_TYPE',
  neck_details:      'M_NECK_STYLE',
  neck_detail:       'M_NECK_STYLE',
  fit:               'M_FIT',
  length:            'M_LENGTH',
  body_style:        'BODY STYLE',
  pocket_type:       'M_POCKET',
  no_of_pocket:      'M_NO_OF_POCKET',
  print_type:        'M_PRINT_TYPE',
  print_style:       'M_PRINT_STYLE',
  print_placement:   'M_PRINT_PLACEMENT',
  patches:           'M_PATCHE_TYPE',
  patch_type:        'M_PATCH_STYLE',
  patches_type:      'M_PATCH_STYLE',
  patch_style:       'M_PATCHE_TYPE',
  embroidery:        'M_EMB_TYPE',
  embroidery_type:   'M_EMBROIDERY_STYLE',
  emb_placement:     'M_EMB_PLACEMENT',
  button:            'M_BTN_TYPE',
  btn_colour:        'M_BTN_CLR',
  zipper:            'M_ZIP_TYPE',
  zip_colour:        'M_ZIP_COL',
  wash:              'M_WASH',
  drawcord:          'M_DC_STYLE',
  dc_shape:          'M_DC_SHAPE',
  father_belt:       'M_BLT_TYPE',
  htrf_type:         'M_HTRF_TYPE',
  htrf_style:        'M_HTRF_STYLE',
  shade:             'SHADE',
  weight:            'WEIGHT',
  child_belt:        'M_BLT_STYLE',
  front_open_style:  'FO BTN STYLE',
  vendor_code:       'VENDOR CODE',
  article_description: 'ARTICLE DESC',
  segment:           'SEGMENT',
  age_group:         'M_AGE_GROUP',
  article_fashion_type: 'ARTICLE FASHION TYPE',
  mvgr_brand_vendor: 'MVGR_BRAND_VENDOR',
  f_count:           'M_COUNT',
  f_construction:    'M_CONSTRUCTION',
  f_ounce:           'M_OUNZ',
  f_width:           'M_WIDTH',
  extra_pocket:      'M_EXTRA_POCKET',
};

/**
 * Maps SAP grid names (from mandatory grid Excel) to frontend schema keys.
 */
export const SAP_NAME_TO_SCHEMA_KEY: Record<string, string> = {
  M_MACRO_MVGR:        'macro_mvgr',
  M_YARN:              'yarn_01',
  'M_YARN-02':         'main_mvgr',
  M_YARN_02:           'main_mvgr',         // legacy alias
  M_WEAVE_2:           'fabric_main_mvgr',
  M_FAB:               'weave',
  M_FAB2:              'm_fab2',
  M_COMPOSITION:       'composition',
  M_COUNT:             'f_count',
  M_CONSTRUCTION:      'f_construction',
  M_LYCRA:             'lycra_non_lycra',
  M_FINISH:            'finish',
  M_GSM:               'gsm',
  M_OUNZ:              'f_ounce',
  M_WIDTH:             'f_width',
  M_UOM:               'f_uom',
  // Collar / Neck — new SAP codes + legacy aliases
  M_COLLAR_TYPE:       'collar',
  M_COLLAR:            'collar',            // legacy alias
  M_COLLAR_STYLE:      'collar_style',
  M_NECK_TYPE:         'neck',
  M_NECK_BAND:         'neck',              // legacy alias
  M_NECK_STYLE:        'neck_details',
  M_NECK_BAND_STYLE:   'neck_details',      // legacy alias
  // Placket / Belt
  M_PLACKET:           'placket',
  M_BLT_TYPE:          'father_belt',
  M_BLT_MAIN_STYLE:    'father_belt',       // legacy alias
  M_BLT_STYLE:         'child_belt',
  M_SUB_STYLE_BLT:     'child_belt',        // legacy alias
  // Sleeve / Bottom
  M_SLEEVES_MAIN_STYLE:'sleeve',
  M_SLEEVE_FOLD:       'sleeve_fold',
  M_BTM_FOLD:          'bottom_fold',
  // Pocket
  NO_OF_POCKET:        'no_of_pocket',      // legacy key
  M_NO_OF_POCKET:      'no_of_pocket',
  M_POCKET:            'pocket_type',
  M_EXTRA_POCKET:      'extra_pocket',
  // Fit / Pattern / Length
  M_FIT:               'fit',
  M_PATTERN:           'body_style',
  M_LENGTH:            'length',
  // Drawcord / Zipper / Button
  M_DC_STYLE:          'drawcord',
  M_DC_SUB_STYLE:      'drawcord',          // legacy alias
  M_DC_SHAPE:          'dc_shape',
  M_BTN_TYPE:          'button',
  M_BTN_MAIN_MVGR:     'button',            // legacy alias
  M_BTN_CLR:           'btn_colour',
  M_ZIP_TYPE:          'zipper',
  M_ZIP:               'zipper',            // legacy alias
  M_ZIP_COL:           'zip_colour',
  // Patches / HTRF
  M_PATCH_STYLE:       'patches_type',
  M_PATCHE_TYPE:       'patches',
  M_PATCHES:           'patches',           // legacy alias
  M_PATCH_TYPE:        'patches_type',      // legacy alias
  M_HTRF_TYPE:         'htrf_type',
  M_HTRF_STYLE:        'htrf_style',
  // Print / Embroidery
  M_PRINT_TYPE:        'print_type',
  M_PRINT_STYLE:       'print_style',
  M_PRINT_PLACEMENT:   'print_placement',
  M_EMB_TYPE:          'embroidery',
  M_EMBROIDERY_STYLE:  'embroidery_type',
  M_EMBROIDERY:        'embroidery',        // legacy alias
  M_EMB_PLACEMENT:     'emb_placement',
  // Wash / Age
  M_WASH:              'wash',
  M_AGE_GROUP:         'age_group',
  // Misc
  M_SHADE:             'shade',
  M_FO_BTN_STYLE:      'front_open_style',
  // Business fields
  'Price Band Category': 'segment',
  'Fashion Grade':     'article_fashion_type',
  'Cost':              'rate',
  'Mrp ( Char Val)':   'mrp',
  'Vendor':            'vendor_name',
  'Weight (Net)(g)':   'weight',
  M_ARTICLE_DIMENSION: 'article_dimension',
};

const mandatoryData = majCatMandatory as Record<string, string[]>;

// Maps frontend schema keys → DB camelCase field names (used in SapFieldConfig/SapAttributeValue)
export const SCHEMA_KEY_TO_DB_FIELD: Record<string, string> = {
  macro_mvgr:           'macroMvgr',
  main_mvgr:            'mainMvgr',
  yarn_01:              'yarn1',
  fabric_main_mvgr:     'fabricMainMvgr',
  weave:                'weave',
  m_fab2:               'mFab2',
  composition:          'composition',
  finish:               'finish',
  gsm:                  'gsm',
  lycra_non_lycra:      'lycra',
  collar:               'collar',
  collar_style:         'collarStyle',
  placket:              'placket',
  sleeve:               'sleeve',
  sleeve_fold:          'sleeveFold',
  bottom_fold:          'bottomFold',
  neck:                 'neck',
  neck_details:         'neckDetails',
  neck_detail:          'neckDetails',
  fit:                  'fit',
  length:               'length',
  body_style:           'bodyStyle',
  pocket_type:          'pocketType',
  no_of_pocket:         'noOfPocket',
  print_type:           'printType',
  print_style:          'printStyle',
  print_placement:      'printPlacement',
  patches:              'patches',
  patch_type:           'patchesType',
  patches_type:         'patches',
  patch_style:          'patches',
  embroidery:           'embroidery',
  embroidery_type:      'embroideryType',
  emb_placement:        'embPlacement',
  button:               'button',
  btn_colour:           'btnColour',
  zipper:               'zipper',
  zip_colour:           'zipColour',
  wash:                 'wash',
  drawcord:             'drawcord',
  dc_shape:             'dcShape',
  father_belt:          'fatherBelt',
  htrf_type:            'htrfType',
  htrf_style:           'htrfStyle',
  shade:                'shade',
  weight:               'weight',
  child_belt:           'childBelt',
  front_open_style:     'frontOpenStyle',
  segment:              'segment',
  age_group:            'ageGroup',
  article_fashion_type: 'articleFashionType',
  mvgr_brand_vendor:    'mvgrBrandVendor',
  f_count:              'fCount',
  f_construction:       'fConstruction',
  f_ounce:              'fOunce',
  f_width:              'fWidth',
  extra_pocket:         'extraPocket',
};

// Reverse map: normalized fullForm → shortForm
const fullFormToShortCode = new Map<string, string>(
  MAJOR_CATEGORY_ALLOWED_VALUES.map(({ shortForm, fullForm }) => [
    fullForm.trim().toUpperCase(),
    shortForm,
  ])
);

// Division-prefix heuristic: which shortCode prefixes correspond to which divisions
const DIVISION_PREFIXES: Record<string, string[]> = {
  MENS:   ['M_', 'MW_'],
  LADIES: ['L_', 'LW_'],
  KIDS:   ['JB_', 'JG_', 'JBW_', 'JGW_', 'YB_', 'YG_', 'YBW_', 'YGW_', 'IB_', 'IG_', 'IBW_', 'IGW_'],
};

/**
 * Normalizes a raw majorCategory (which may be a full-form name like "TEES HALF SLEEVE"
 * or already a short code like "M_TEES_HS") to its short code.
 * Falls back to the raw value if no match is found.
 */
export function normalizeMajorCategory(raw: string, division?: string | null): string {
  if (!raw) return raw;
  const upper = raw.trim().toUpperCase();

  // 2. Exact full-form match
  const exact = fullFormToShortCode.get(upper);
  if (exact) return exact;

  // 3. Suffix match: find all entries whose fullForm ends with raw
  const suffixMatches = MAJOR_CATEGORY_ALLOWED_VALUES.filter(({ fullForm }) =>
    fullForm.trim().toUpperCase().endsWith(upper)
  );

  if (suffixMatches.length === 0) return raw;
  if (suffixMatches.length === 1) return suffixMatches[0].shortForm;

  // 4. Disambiguate using division
  const divUpper = (division || '').trim().toUpperCase();
  const prefixes = DIVISION_PREFIXES[divUpper];
  if (prefixes) {
    const filtered = suffixMatches.filter(({ shortForm }) =>
      prefixes.some((p) => shortForm.startsWith(p))
    );
    if (filtered.length === 1) return filtered[0].shortForm;
    if (filtered.length > 1) return filtered[0].shortForm; // best guess
  }

  return suffixMatches[0].shortForm; // fallback: first suffix match
}

/**
 * Returns the allowed values (shortForm/fullForm pairs) for a given schema key
 * scoped to the selected major category.
 * Returns null if no mapping exists (caller should keep existing values).
 */
export function getMajCatAllowedValues(
  majorCategory: string,
  schemaKey: string
): { shortForm: string; fullForm: string }[] | null {
  const dbField = SCHEMA_KEY_TO_DB_FIELD[schemaKey.toLowerCase()];
  if (!dbField) return null;

  const values = getCachedValues(majorCategory, dbField);
  if (!values || values.length === 0) return null;

  return values.map((v) => ({ shortForm: v, fullForm: v }));
}

/**
 * Returns the set of schema keys that are mandatory for the given major category.
 * Prefers DB cache (CategoryAttribute.isRequired) if available,
 * falls back to archived JSON only when DB data hasn't been loaded yet.
 */
export function getMajCatMandatoryKeys(majorCategory: string): Set<string> {
  // DB-first: use cached CategoryAttribute data if available
  const dbConfig = getCachedCategoryAttributes(majorCategory);
  if (dbConfig?.configured) return dbConfig.required;

  // Fallback: archived JSON (used only before DB cache is warm)
  const sapNames = mandatoryData[majorCategory];
  if (!sapNames || sapNames.length === 0) return new Set();

  const keys = new Set<string>();
  for (const sap of sapNames) {
    const schemaKey = SAP_NAME_TO_SCHEMA_KEY[sap];
    if (schemaKey) keys.add(schemaKey);
  }
  return keys;
}
