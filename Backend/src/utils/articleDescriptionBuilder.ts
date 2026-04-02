type ArticleDescriptionSource = {
  yarn1?: unknown;
  weave?: unknown;
  mFab2?: unknown;
  fabricMainMvgr?: unknown;
  lycra?: unknown;
  neck?: unknown;
  sleeve?: unknown;
  collar?: unknown;
  placket?: unknown;
  bottomFold?: unknown;
  frontOpenStyle?: unknown;
  pocketType?: unknown;
  fit?: unknown;
  pattern?: unknown;
  length?: unknown;
  drawcord?: unknown;
  button?: unknown;
  zipper?: unknown;
  zipColour?: unknown;
  printType?: unknown;
  printStyle?: unknown;
  printPlacement?: unknown;
  patches?: unknown;
  patchesType?: unknown;
  embroidery?: unknown;
  embroideryType?: unknown;
  wash?: unknown;
  fatherBelt?: unknown;
  childBelt?: unknown;
  composition?: unknown;
  finish?: unknown;
  gsm?: unknown;
  shade?: unknown;
};

const ARTICLE_DESCRIPTION_MAX_LENGTH = 40;

const ARTICLE_DESCRIPTION_FIELDS: Array<keyof ArticleDescriptionSource> = [
  'yarn1',
  'weave',
  'mFab2',
  'fabricMainMvgr',
  'lycra',
  'neck',
  'sleeve',
  'collar',
  'placket',
  'bottomFold',
  'frontOpenStyle',
  'pocketType',
  'fit',
  'pattern',
  'length',
  'drawcord',
  'button',
  'zipper',
  'zipColour',
  'printType',
  'printStyle',
  'printPlacement',
  'patches',
  'patchesType',
  'embroidery',
  'embroideryType',
  'wash',
  'fatherBelt',
  'childBelt',
  'composition',
  'finish',
  'gsm',
  'shade'
];

const toShortToken = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase();

  return text || null;
};

export const buildArticleDescription = (
  source: ArticleDescriptionSource,
  maxLength: number = ARTICLE_DESCRIPTION_MAX_LENGTH
): string | null => {
  let description = '';

  for (const field of ARTICLE_DESCRIPTION_FIELDS) {
    const token = toShortToken(source[field]);
    if (!token) continue;

    if (!description) {
      description = token.length > maxLength ? token.slice(0, maxLength) : token;
      if (description.length >= maxLength) break;
      continue;
    }

    const candidate = `${description}-${token}`;
    if (candidate.length > maxLength) {
      const remaining = maxLength - description.length;
      if (remaining > 0) {
        description = `${description}-${token}`.slice(0, maxLength);
      }
      break;
    }

    description = candidate;
  }

  return description || null;
};

export const ARTICLE_DESCRIPTION_SOURCE_FIELDS = ARTICLE_DESCRIPTION_FIELDS;
