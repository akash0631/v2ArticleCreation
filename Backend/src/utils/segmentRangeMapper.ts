import fs from 'fs';
import path from 'path';

type RawRangeRow = Record<string, unknown>;

type SegmentCode = 'E' | 'V' | 'P' | 'SP';

type SegmentRange = {
  code: SegmentCode;
  min: number;
  max: number;
};

const RANGE_FILE_PATH = path.resolve(__dirname, '../../../aa (1).json');

const resolveRangeFilePath = (): string => {
  const envPath = process.env.SEGMENT_RANGE_FILE_PATH?.trim();
  const candidates = [
    envPath,
    RANGE_FILE_PATH,
    path.resolve(__dirname, '../../../aa.json')
  ].filter((value): value is string => !!value);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return RANGE_FILE_PATH;
};

const normalizeKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ');

const normalizeCategory = (value?: string | null): string =>
  (value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/_*-_*/g, '-')
    .replace(/[^A-Z0-9_\-]/g, '');

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRawRows = (): RawRangeRow[] => {
  const filePath = resolveRangeFilePath();
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // aa (1).json currently comes as object-list (without outer []).
    // Wrap and parse safely.
    const wrapped = `[${raw.replace(/^,\s*/, '')}]`;
    const parsed = JSON.parse(wrapped);
    return Array.isArray(parsed) ? parsed : [];
  }
};

const buildRanges = (row: RawRangeRow): SegmentRange[] => {
  const definitions: Array<{ code: SegmentCode; label: string }> = [
    { code: 'E', label: 'Economy' },
    { code: 'V', label: 'Value' },
    { code: 'P', label: 'Premium' },
    { code: 'SP', label: 'Super Premium' }
  ];

  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const);

  const getValueByNormalizedKeys = (keys: string[]): unknown => {
    const wanted = new Set(keys.map(normalizeKey));
    const match = normalizedEntries.find(([key]) => wanted.has(key));
    return match?.[1];
  };

  const getBounds = (label: string): { min: number | null; max: number | null } => {
    const normalizedLabel = normalizeKey(label);

    const nestedCandidate = getValueByNormalizedKeys([
      label,
      `${label} segment`,
      normalizedLabel
    ]);

    if (nestedCandidate && typeof nestedCandidate === 'object' && !Array.isArray(nestedCandidate)) {
      const nested = nestedCandidate as Record<string, unknown>;
      const nestedEntries = Object.entries(nested).map(([key, value]) => [normalizeKey(key), value] as const);
      const nestedGet = (keys: string[]) => {
        const wanted = new Set(keys.map(normalizeKey));
        const match = nestedEntries.find(([key]) => wanted.has(key));
        return match?.[1];
      };

      const minNested = toNumber(nestedGet(['min', 'minimum', `${label} min`, `${label} minimum`]));
      const maxNested = toNumber(nestedGet(['max', 'maximum', `${label} max`, `${label} maximum`]));
      if (minNested !== null || maxNested !== null) {
        return { min: minNested, max: maxNested };
      }
    }

    const min = toNumber(
      getValueByNormalizedKeys([
        `${label} minimum`,
        `${label} min`,
        `${normalizedLabel} minimum`,
        `${normalizedLabel} min`,
        `${label}_minimum`,
        `${label}_min`
      ])
    );

    const max = toNumber(
      getValueByNormalizedKeys([
        `${label} maximum`,
        `${label} max`,
        `${normalizedLabel} maximum`,
        `${normalizedLabel} max`,
        `${label}_maximum`,
        `${label}_max`
      ])
    );

    return { min, max };
  };

  const ranges: SegmentRange[] = [];

  for (const def of definitions) {
    const { min, max } = getBounds(def.label);
    if (min === null || max === null) continue;

    // Invalid segment range: both min and max are 0.
    if (min === 0 && max === 0) continue;

    ranges.push({ code: def.code, min, max });
  }

  return ranges;
};

const rows = parseRawRows();

const rangeLookup = new Map<string, SegmentRange[]>(
  rows
    .map((row) => {
      const majorCategory = row['Major Category'];
      if (!majorCategory) return null;

      const ranges = buildRanges(row);
      if (ranges.length === 0) return null;

      return [normalizeCategory(String(majorCategory)), ranges] as const;
    })
    .filter((entry): entry is readonly [string, SegmentRange[]] => !!entry)
);

export const getSegmentByCategoryAndMrp = (
  majorCategory?: string | null,
  mrp?: unknown
): SegmentCode | null => {
  const key = normalizeCategory(majorCategory);
  if (!key) return null;

  const numericMrp = toNumber(mrp);
  if (numericMrp === null) return null;

  const ranges = rangeLookup.get(key);
  if (!ranges || ranges.length === 0) return null;

  for (const range of ranges) {
    if (numericMrp >= range.min && numericMrp <= range.max) {
      return range.code;
    }
  }

  return null;
};
