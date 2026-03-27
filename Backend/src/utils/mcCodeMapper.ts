import majorCategoryCodeData from '../data/mc-code-list-major-category.json';
import hsnCodeData from '../data/hsncode.json';

type McCodeRow = {
  mc_code?: number | string;
  'mc code'?: number | string;
  'mc des'?: string;
  'MC CD'?: number | string;
  MC_DESC?: string;
  'hsn code'?: number | string;
};

type McCodePayload = McCodeRow[] | { Sheet1?: McCodeRow[] };

const normalizeCategory = (value?: string | null): string =>
  (value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/_*-_*/g, '-')
    .replace(/[^A-Z0-9_\-]/g, '');

const payload = majorCategoryCodeData as McCodePayload;

const rows: McCodeRow[] = Array.isArray(payload)
  ? payload
  : (payload.Sheet1 || []);

const mcCodeLookup = new Map<string, string>(
  rows
    .map((row) => {
      const category = row['mc des'] ?? row.MC_DESC;
      const code = row.mc_code ?? row['mc code'] ?? row['MC CD'];
      return {
        category,
        code
      };
    })
    .filter((row) => !!row.category && row.code !== undefined && row.code !== null)
    .map((row) => [normalizeCategory(row.category), String(row.code)])
);

const hsnPayload = hsnCodeData as McCodePayload;

const hsnRows: McCodeRow[] = Array.isArray(hsnPayload)
  ? hsnPayload
  : (hsnPayload.Sheet1 || []);

const hsnByMcCodeLookup = new Map<string, string>(
  hsnRows
    .map((row) => {
      const code = row['MC CD'] ?? row['mc code'];
      const hsn = row['hsn code'];
      return {
        code,
        hsn
      };
    })
    .filter((row) => row.code !== undefined && row.code !== null && row.hsn !== undefined && row.hsn !== null && String(row.hsn).trim() !== '')
    .map((row) => [String(row.code), String(row.hsn)])
);

export const getMcCodeByMajorCategory = (majorCategory?: string | null): string | null => {
  const key = normalizeCategory(majorCategory);
  if (!key) return null;
  return mcCodeLookup.get(key) || null;
};

export const getHsnCodeByMcCode = (mcCode?: string | number | null): string | null => {
  if (mcCode === undefined || mcCode === null) return null;
  const key = String(mcCode).trim();
  if (!key) return null;
  return hsnByMcCodeLookup.get(key) || null;
};
