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
  fabricMainMvgr?: unknown;  // FAB-MAIN-MVGR-2
  weave?: unknown;           // WEAVE 01
  mFab2?: unknown;           // WEAVE 02
  lycra?: unknown;           // M_LYCRA
  neck?: unknown;            // M_NECK_TYPE
  collar?: unknown;          // M_COLLAR_TYPE
  sleeve?: unknown;          // M_SLEEVES_MAIN_STYLE
  sleeveFold?: unknown;      // M_SLEEVE_FOLD
  pocketType?: unknown;      // M_POCKET
  childBelt?: unknown;       // M_BLT_STYLE
  length?: unknown;          // M_LENGTH
  fit?: unknown;             // M_FIT
  pattern?: unknown;         // BODY STYLE
  printType?: unknown;       // M_PRINT_TYPE
  embroidery?: unknown;      // M_EMB_TYPE
  embroideryType?: unknown;  // M_EMBROIDERY_STYLE
  wash?: unknown;            // M_WASH
};

const ARTICLE_DESCRIPTION_MAX_LENGTH = 40;

const ARTICLE_DESCRIPTION_FIELDS: Array<keyof ArticleDescriptionSource> = [
  'fabDiv',
  'yarn1',
  'fabricMainMvgr',
  'weave',
  'mFab2',
  'lycra',
  'neck',
  'collar',
  'sleeve',
  'sleeveFold',
  'pocketType',
  'childBelt',
  'length',
  'fit',
  'pattern',
  'printType',
  'embroidery',
  'embroideryType',
  'wash',
];

const toShortToken = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9_\-*]/g, '')
    .toUpperCase();
  // Skip dash-only values — VLM returns "-" to mean "not visible / not applicable".
  // Without this guard, ["-", "-", "TOP", "RINSE"].join('-') → "----TOP-RINSE"
  if (!text || /^-+$/.test(text)) return null;
  return text;
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
