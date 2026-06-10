/**
 * Article Description Builder
 *
 * Field order (user-confirmed sequence):
 *   fabDiv → yarn1 → fabricMainMvgr → weave → mFab2 → neckDetails →
 *   collarStyle → fatherBelt → fit → pattern
 * Joined with '-', sliced to 40 chars from the front.
 * BODY STYLE is mapped to the `pattern` column in ExtractionResultFlat.
 *
 * Pass `excludeFields` to skip specific fields for a given article context.
 * Example: collar is only included when it is visible in the article card
 * for the given major category (checked via categoryFieldVisibility helper).
 */

type ArticleDescriptionSource = {
  fabDiv?: unknown;          // M_FAB_DIV
  yarn1?: unknown;           // M_YARN
  fabricMainMvgr?: unknown;  // M_FAB_MAIN_MVGR_2
  weave?: unknown;           // M_WEAVE_01
  mFab2?: unknown;           // M_WEAVE_02
  neckDetails?: unknown;     // M_NECK_STYLE
  collarStyle?: unknown;     // M_COLLAR_STYLE
  fatherBelt?: unknown;      // M_BLT_TYPE
  fit?: unknown;             // M_FIT
  pattern?: unknown;         // M_BODY_STYLE
};

export type ArticleDescriptionOptions = {
  /** Fields to skip regardless of their value (e.g. collar when not visible for the major category) */
  excludeFields?: ReadonlySet<keyof ArticleDescriptionSource>;
};

const ARTICLE_DESCRIPTION_MAX_LENGTH = 40;

const ARTICLE_DESCRIPTION_FIELDS: Array<keyof ArticleDescriptionSource> = [
  'fabDiv',         // M_FAB_DIV
  'yarn1',          // M_YARN
  'fabricMainMvgr', // M_FAB_MAIN_MVGR_2
  'weave',          // M_WEAVE_01
  'mFab2',          // M_WEAVE_02
  'neckDetails',    // M_NECK_STYLE
  'collarStyle',    // M_COLLAR_STYLE
  'fatherBelt',     // M_BLT_TYPE
  'fit',            // M_FIT
  'pattern',        // M_BODY_STYLE
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
  maxLength: number = ARTICLE_DESCRIPTION_MAX_LENGTH,
  options?: ArticleDescriptionOptions
): string | null => {
  const exclude = options?.excludeFields;

  // Collect all non-empty tokens in the fixed sequence order
  const tokens: string[] = [];

  for (const field of ARTICLE_DESCRIPTION_FIELDS) {
    // Skip fields that are not visible for this article's major category
    if (exclude?.has(field)) continue;

    const token = toShortToken(source[field]);
    if (token) tokens.push(token);
  }

  if (tokens.length === 0) return null;

  // Join with dash, then slice from the end if over maxLength
  return tokens.join('-').slice(0, maxLength);
};

export const ARTICLE_DESCRIPTION_SOURCE_FIELDS = ARTICLE_DESCRIPTION_FIELDS;
