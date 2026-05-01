/**
 * Maps frontend schema keys to Excel CHILD_MAJ_CAT attribute names.
 * Used to filter allowed values per major category from maj-cat-attribute-values.json.
 */
export const SCHEMA_KEY_TO_EXCEL_ATTR: Record<string, string> = {
  macro_mvgr:        'OTHER MVGR',
  main_mvgr:         'F_FABRIC MAIN MVGR-01',
  yarn_01:           'F_YARN',
  fabric_main_mvgr:  'F_FABRIC MAIN MVGR-02',
  weave:             'F_WEAVE_01',
  m_fab2:            'F_WEAVE_02',
  composition:       'F_COMP',
  finish:            'F_FINISH',
  gsm:               'F_GSM_GLM',
  lycra_non_lycra:   'F_STRETCH',
  collar:            'COLLAR TYPE',
  collar_style:      'COLLAR STYLE',
  placket:           'PLACKET',
  sleeve:            'SLEEVE',
  sleeve_fold:       'SLEEVE FOLD',
  bottom_fold:       'BOTTOM FOLD',
  neck:              'NECK TYPE',
  neck_details:      'NECK STYLE',
  neck_detail:       'NECK STYLE',
  fit:               'FIT',
  length:            'LENGTH',
  body_style:        'BODY STYLE',
  pocket_type:       'POCKET TYPE',
  no_of_pocket:      'NO. OF POCKET',
  print_type:        'PRT_TYPE',
  print_style:       'PRT_STYLE',
  print_placement:   'PRT_PLCMNT',
  patches:           'PATCH_TYPE',
  patch_type:        'PATCH_TYPE',
  patches_type:      'PATCH_STYLE',
  patch_style:       'PATCH_STYLE',
  embroidery:        'EMB_TYPE',
  embroidery_type:   'EMB_STYLE',
  emb_placement:     'EMB_PLACEMENT',
  button:            'BTN_TYPE',
  btn_colour:        'BTN_CLR',
  zipper:            'ZIP_TYPE',
  zip_colour:        'ZIP_CLR',
  wash:              'WASH',
  drawcord:          'DC_TYPE',
  dc_shape:          'DC_SHAPE',
  father_belt:       'BELT',
  htrf_type:         'HTRF_TYPE',
  htrf_style:        'HTRF_STYLE',
  shade:             'SHADE',
  weight:            'WEIGHT',
  child_belt:        'BELT STYLE',
  front_open_style:  'FO BTN STYLE',
  vendor_code:       'VENDOR CODE',
  article_description: 'ARTICLE DESC',
  segment:           'SEGMENT',
  age_group:         'AGE GROUP',
  article_fashion_type: 'ARTICLE FASHION TYPE',
  mvgr_brand_vendor: 'MVGR_BRAND_VENDOR',
  f_count:           'F_COUNT',
  f_construction:    'F_CONSTRUCTION',
  f_ounce:           'F_OUNCE',
  f_width:           'F_WIDTH',
  extra_pocket:      'EXTRA POCKET',
};

/**
 * Maps SAP grid names (from mandatory grid Excel) to frontend schema keys.
 */
export const SAP_NAME_TO_SCHEMA_KEY: Record<string, string> = {
  M_MACRO_MVGR:        'macro_mvgr',
  M_YARN:              'yarn_01',
  M_YARN_02:           'main_mvgr',
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
  M_COLLAR:            'collar',
  M_COLLAR_STYLE:      'collar_style',
  M_NECK_BAND_STYLE:   'neck_details',
  M_NECK_BAND:         'neck',
  M_PLACKET:           'placket',
  M_BLT_MAIN_STYLE:    'father_belt',
  M_SLEEVES_MAIN_STYLE:'sleeve',
  M_SLEEVE_FOLD:       'sleeve_fold',
  M_BTM_FOLD:          'bottom_fold',
  NO_OF_POCKET:        'no_of_pocket',   // legacy key
  M_NO_OF_POCKET:      'no_of_pocket',   // new SAP code (Excel updated)
  M_POCKET:            'pocket_type',
  M_EXTRA_POCKET:      'extra_pocket',
  M_FIT:               'fit',
  M_PATTERN:           'body_style',
  M_LENGTH:            'length',
  M_DC_SUB_STYLE:      'drawcord',
  M_DC_SHAPE:          'dc_shape',
  M_BTN_MAIN_MVGR:     'button',
  M_BTN_CLR:           'btn_colour',
  M_ZIP:               'zipper',
  M_ZIP_COL:           'zip_colour',
  M_PATCHES:           'patches',
  M_PATCH_TYPE:        'patches_type',
  M_PRINT_TYPE:        'print_type',
  M_PRINT_STYLE:       'print_style',
  M_PRINT_PLACEMENT:   'print_placement',
  M_EMBROIDERY:        'embroidery',
  M_EMB_TYPE:          'embroidery_type',
  M_EMB_PLACEMENT:     'emb_placement',
  M_HTRF_TYPE:         'htrf_type',
  M_HTRF_STYLE:        'htrf_style',
  M_SHADE:             'shade',
  M_SUB_STYLE_BLT:     'child_belt',
  M_FO_BTN_STYLE:      'front_open_style',
  M_WASH:              'wash',
  M_AGE_GROUP:         'age_group',
  'Price Band Category': 'segment',
  'Fashion Grade':     'article_fashion_type',
  'Cost':              'rate',
  'Mrp ( Char Val)':   'mrp',
  'Vendor':            'vendor_name',
  'Weight (Net)(g)':   'weight',
  M_ARTICLE_DIMENSION: 'article_dimension',
};

import majCatMandatory from './maj-cat-mandatory.json';
import { MAJOR_CATEGORY_ALLOWED_VALUES } from './majorCategoryMap';
import { getCachedValues } from '../services/articleConfigService';

const mandatoryData = majCatMandatory as Record<string, string[]>;

// Maps frontend schema keys → DB camelCase field names (used in SapFieldConfig/SapAttributeValue)
const SCHEMA_KEY_TO_DB_FIELD: Record<string, string> = {
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
 * Returns an empty Set if the category is not found.
 */
export function getMajCatMandatoryKeys(majorCategory: string): Set<string> {
  const sapNames = mandatoryData[majorCategory];
  if (!sapNames || sapNames.length === 0) return new Set();

  const keys = new Set<string>();
  for (const sap of sapNames) {
    const schemaKey = SAP_NAME_TO_SCHEMA_KEY[sap];
    if (schemaKey) keys.add(schemaKey);
  }
  return keys;
}
