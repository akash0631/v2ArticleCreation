/**
 * Article Description Builder
 *
 * Field order defined by user-confirmed sequence (47 fields).
 * Joined with '-', sliced to 40 chars from the front.
 * BODY STYLE is mapped to the `pattern` column in ExtractionResultFlat.
 */

type ArticleDescriptionSource = {
  fabDiv?: unknown;          // M_FAB_DIV
  yarn1?: unknown;           // M_YARN
  mainMvgr?: unknown;        // FAB_MAIN_MVGR-1
  fabricMainMvgr?: unknown;  // FAB-MAIN-MVGR-2
  weave?: unknown;           // WEAVE 01
  mFab2?: unknown;           // WEAVE 02
  fCount?: unknown;          // M_COUNT
  gsm?: unknown;             // M_GSM
  fOunce?: unknown;          // M_OUNZ
  fConstruction?: unknown;   // M_CONSTRUCTION
  finish?: unknown;          // M_FINISH
  fWidth?: unknown;          // M_WIDTH
  lycra?: unknown;           // M_LYCRA
  neck?: unknown;            // M_NECK_TYPE
  neckDetails?: unknown;     // M_NECK_STYLE
  collar?: unknown;          // M_COLLAR_TYPE
  collarStyle?: unknown;     // M_COLLAR_STYLE
  sleeve?: unknown;          // M_SLEEVES_MAIN_STYLE
  sleeveFold?: unknown;      // M_SLEEVE_FOLD
  placket?: unknown;         // M_PLACKET
  childBelt?: unknown;       // M_BLT_STYLE
  bottomFold?: unknown;      // M_BTM_FOLD
  pocketType?: unknown;      // M_POCKET
  noOfPocket?: unknown;      // M_NO_OF_POCKET
  extraPocket?: unknown;     // M_EXTRA_POCKET
  length?: unknown;          // M_LENGTH
  fit?: unknown;             // M_FIT
  pattern?: unknown;         // BODY STYLE
  drawcord?: unknown;        // M_DC_STYLE
  dcShape?: unknown;         // M_DC_SHAPE
  zipper?: unknown;          // M_ZIP_TYPE
  zipColour?: unknown;       // M_ZIP_COL
  button?: unknown;          // M_BTN_TYPE
  btnColour?: unknown;       // M_BTN_CLR
  patchesType?: unknown;     // M_PATCH_STYLE
  patches?: unknown;         // M_PATCHE_TYPE
  htrfStyle?: unknown;       // M_HTRF_STYLE
  htrfType?: unknown;        // M_HTRF_TYPE
  printPlacement?: unknown;  // M_PRINT_PLACEMENT
  printStyle?: unknown;      // M_PRINT_STYLE
  printType?: unknown;       // M_PRINT_TYPE
  embroidery?: unknown;      // M_EMB_TYPE
  embroideryType?: unknown;  // M_EMBROIDERY_STYLE
  embPlacement?: unknown;    // M_EMB_PLACEMENT
  wash?: unknown;            // M_WASH
  ageGroup?: unknown;        // M_AGE_GROUP
  impAtrbt2?: unknown;       // IMP_ATRBT-2
};

const ARTICLE_DESCRIPTION_MAX_LENGTH = 40;

const ARTICLE_DESCRIPTION_FIELDS: Array<keyof ArticleDescriptionSource> = [
  'fabDiv',
  'yarn1',
  'mainMvgr',
  'fabricMainMvgr',
  'weave',
  'mFab2',
  'fCount',
  'gsm',
  'fOunce',
  'fConstruction',
  'finish',
  'fWidth',
  'lycra',
  'neck',
  'neckDetails',
  'collar',
  'collarStyle',
  'sleeve',
  'sleeveFold',
  'placket',
  'childBelt',
  'bottomFold',
  'pocketType',
  'noOfPocket',
  'extraPocket',
  'length',
  'fit',
  'pattern',
  'drawcord',
  'dcShape',
  'zipper',
  'zipColour',
  'button',
  'btnColour',
  'patchesType',
  'patches',
  'htrfStyle',
  'htrfType',
  'printPlacement',
  'printStyle',
  'printType',
  'embroidery',
  'embroideryType',
  'embPlacement',
  'wash',
  'ageGroup',
  'impAtrbt2',
];

const toShortToken = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9_\-*]/g, '')
    .toUpperCase();
  return text || null;
};

export const buildArticleDescription = (
  source: ArticleDescriptionSource,
  maxLength: number = ARTICLE_DESCRIPTION_MAX_LENGTH
): string | null => {
  // Collect all non-empty tokens in the fixed sequence order
  const tokens: string[] = [];

  for (const field of ARTICLE_DESCRIPTION_FIELDS) {
    const token = toShortToken(source[field]);
    if (token) tokens.push(token);
  }

  if (tokens.length === 0) return null;

  // Join with dash, then slice from the end if over maxLength
  return tokens.join('-').slice(0, maxLength);
};

export const ARTICLE_DESCRIPTION_SOURCE_FIELDS = ARTICLE_DESCRIPTION_FIELDS;
