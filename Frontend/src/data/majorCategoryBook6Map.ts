// @ts-ignore
import book6Data from './book6-major-category.json';

type Book6Row = {
  MAJ_CAT_CD?: number | string;
  MAJ_CAT_NM?: string;
};

const normalizeCategory = (value?: string | null): string =>
  (value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/_*-_*/g, '-')
    .replace(/[^A-Z0-9_\-]/g, '');

const rows = (book6Data as Book6Row[])
  .filter((row) => row.MAJ_CAT_NM && row.MAJ_CAT_CD !== undefined && row.MAJ_CAT_CD !== null)
  .map((row) => ({
    name: String(row.MAJ_CAT_NM).trim(),
    code: String(row.MAJ_CAT_CD).trim()
  }));

const uniqueNames = Array.from(new Set(rows.map((row) => row.name)));

export const MAJOR_CATEGORY_ALLOWED_VALUES = uniqueNames.map((name) => ({
  shortForm: name,
  fullForm: name
}));

const mcCodeLookup = new Map<string, string>(
  rows.map((row) => [normalizeCategory(row.name), row.code])
);

export const getMcCodeByMajorCategory = (majorCategory?: string | null): string | null => {
  const key = normalizeCategory(majorCategory);
  if (!key) return null;
  return mcCodeLookup.get(key) || null;
};
