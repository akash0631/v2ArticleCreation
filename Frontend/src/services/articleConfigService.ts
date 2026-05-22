/**
 * articleConfigService.ts
 *
 * Fetches SAP field configs and attribute values from the backend DB.
 * Values are scoped by division (MENS | LADIES | KIDS) from the National Grid.
 * In-memory cache so components can call getCachedValues() synchronously after preload.
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');

const api = axios.create({ baseURL: `${API_BASE_URL}/article-config` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SapFieldConfig {
  id: number;
  section: string;
  uiLabel: string;
  dbField: string;
  sapField: string;
  displayOrder: number;
}

// Normalise any division string to MENS | LADIES | KIDS
function normaliseDivision(raw: string): string {
  const u = raw.trim().toUpperCase();
  if (u.startsWith('MEN')) return 'MENS';
  if (u.startsWith('LAD') || u.startsWith('WOM')) return 'LADIES';
  if (u.startsWith('KID') || u.startsWith('JUN') || u.startsWith('BOY') || u.startsWith('GIR')) return 'KIDS';
  return u; // pass-through
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const valuesCache = new Map<string, Record<string, string[]>>();
let fieldsCache: SapFieldConfig[] | null = null;
const pendingLoads = new Map<string, Promise<void>>();

// ─── Public API ───────────────────────────────────────────────────────────────

export async function preloadFieldConfigs(): Promise<SapFieldConfig[]> {
  if (fieldsCache) return fieldsCache;
  const { data } = await api.get<{ data: SapFieldConfig[] }>('/fields');
  fieldsCache = data.data;
  return fieldsCache;
}

/**
 * Preload allowed values for a division (MENS | LADIES | KIDS).
 * Also accepts a full division name like "MENS TOPWEAR" — normalised automatically.
 * Safe to call multiple times — deduplicates in-flight requests.
 */
export async function preloadAttributeValues(divisionOrCategory: string): Promise<void> {
  const division = normaliseDivision(divisionOrCategory);
  if (valuesCache.has(division)) return;
  if (pendingLoads.has(division)) return pendingLoads.get(division)!;

  const load = api
    .get<{ data: Record<string, string[]> }>(`/values?division=${encodeURIComponent(division)}`)
    .then(({ data }) => { valuesCache.set(division, data.data); })
    .finally(() => pendingLoads.delete(division));

  pendingLoads.set(division, load);
  return load;
}

/**
 * Synchronous lookup — returns values from cache.
 * divisionOrCategory is normalised automatically.
 * Call preloadAttributeValues(division) first; returns null if not yet loaded.
 */
export function getCachedValues(
  divisionOrCategory: string,
  dbField: string
): string[] | null {
  const division = normaliseDivision(divisionOrCategory);
  const catData = valuesCache.get(division);
  if (!catData) return null;
  return catData[dbField] ?? null;
}

export function isValuesCached(divisionOrCategory: string): boolean {
  return valuesCache.has(normaliseDivision(divisionOrCategory));
}

export function invalidateValuesCache(divisionOrCategory?: string): void {
  if (divisionOrCategory) {
    const division = normaliseDivision(divisionOrCategory);
    valuesCache.delete(division);
    pendingLoads.delete(division);
  } else {
    valuesCache.clear();
    pendingLoads.clear();
  }
}

export function getCachedFieldConfigs(): SapFieldConfig[] | null {
  return fieldsCache;
}

export function buildDbToSapMap(): Record<string, string> {
  if (!fieldsCache) return {};
  return Object.fromEntries(fieldsCache.map((f) => [f.dbField, f.sapField]));
}

export function buildUiLabelToDbFieldMap(): Record<string, string> {
  if (!fieldsCache) return {};
  return Object.fromEntries(fieldsCache.map((f) => [f.uiLabel, f.dbField]));
}

// ─── Attribute Groups (for dynamic article card layout) ───────────────────────

export interface AttributeGroupEntry {
  key: string;
  type: 'TEXT' | 'SELECT' | 'NUMBER';
  group: string;
}

let attributeGroupsCache: AttributeGroupEntry[] | null = null;
let attributeGroupsPromise: Promise<AttributeGroupEntry[]> | null = null;

export async function preloadAttributeGroups(): Promise<AttributeGroupEntry[]> {
  if (attributeGroupsCache) return attributeGroupsCache;
  if (attributeGroupsPromise) return attributeGroupsPromise;

  const baseURL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  attributeGroupsPromise = fetch(`${baseURL}/admin/attributes`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(r => r.ok ? r.json() : null)
    .then(json => {
      const attrs: AttributeGroupEntry[] = (json?.data ?? [])
        .filter((a: any) => a.group && a.isActive)
        .map((a: any) => ({ key: a.key, type: a.type, group: a.group }));
      attributeGroupsCache = attrs;
      return attrs;
    })
    .catch(() => [] as AttributeGroupEntry[])
    .finally(() => { attributeGroupsPromise = null; });

  return attributeGroupsPromise;
}

export function getCachedAttributeGroups(): AttributeGroupEntry[] | null {
  return attributeGroupsCache;
}

// ─── Per-category enabled/required attribute config ───────────────────────────

export interface CategoryAttrConfig {
  configured: boolean;      // false = no mappings yet, show all (fallback)
  enabled: Set<string>;     // schema keys that are enabled
  required: Set<string>;    // schema keys that are required
}

const CATEGORY_ATTR_TTL_MS = 3 * 60 * 1000; // 3 minutes
const categoryAttrCache = new Map<string, { config: CategoryAttrConfig; ts: number }>();
const categoryAttrPending = new Map<string, Promise<CategoryAttrConfig>>();

export async function preloadCategoryAttributes(categoryCode: string): Promise<CategoryAttrConfig> {
  const cached = categoryAttrCache.get(categoryCode);
  if (cached && Date.now() - cached.ts < CATEGORY_ATTR_TTL_MS) return cached.config;
  if (categoryAttrPending.has(categoryCode)) return categoryAttrPending.get(categoryCode)!;

  const baseURL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  const p = fetch(`${baseURL}/article-config/category-attributes/${encodeURIComponent(categoryCode)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(r => r.ok ? r.json() : null)
    .then((json): CategoryAttrConfig => {
      if (!json?.success) return { configured: false, enabled: new Set(), required: new Set() };
      const result: CategoryAttrConfig = {
        configured: json.configured,
        enabled: new Set<string>(json.enabled ?? []),
        required: new Set<string>(json.required ?? []),
      };
      categoryAttrCache.set(categoryCode, { config: result, ts: Date.now() });
      return result;
    })
    .catch((): CategoryAttrConfig => ({ configured: false, enabled: new Set(), required: new Set() }))
    .finally(() => categoryAttrPending.delete(categoryCode));

  categoryAttrPending.set(categoryCode, p);
  return p;
}

export function getCachedCategoryAttributes(categoryCode: string): CategoryAttrConfig | null {
  const cached = categoryAttrCache.get(categoryCode);
  if (!cached) return null;
  if (Date.now() - cached.ts >= CATEGORY_ATTR_TTL_MS) {
    categoryAttrCache.delete(categoryCode);
    return null;
  }
  return cached.config;
}

export function invalidateCategoryAttributeCache(categoryCode?: string) {
  if (categoryCode) categoryAttrCache.delete(categoryCode);
  else categoryAttrCache.clear();
}

// ─── Major-Category Grid Values (from uploaded Excel) ─────────────────────────
// Structure: { [majorCategory]: { [excelAttrName]: string[] } }
// e.g.  { "L_PLAZO": { "M_FAB_DIV": ["K","W","DNM"], ... }, ... }

type MajCatGrid = Record<string, Record<string, string[]>>;

let majCatGrid: MajCatGrid | null = null;
let majCatGridPromise: Promise<MajCatGrid> | null = null;

/**
 * Fetch the full major-category grid from the backend (once per session).
 * Returns an empty object if not yet uploaded.
 */
export async function preloadMajCatGrid(): Promise<MajCatGrid> {
  if (majCatGrid !== null) return majCatGrid;
  if (majCatGridPromise) return majCatGridPromise;

  const baseURL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  majCatGridPromise = fetch(`${baseURL}/article-config/majcat-grid`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(r => r.ok ? r.json() : { data: {} })
    .then(json => {
      majCatGrid = (json?.data as MajCatGrid) ?? {};
      return majCatGrid;
    })
    .catch(() => {
      majCatGrid = {};
      return majCatGrid as MajCatGrid;
    })
    .finally(() => { majCatGridPromise = null; });

  return majCatGridPromise;
}

/**
 * Synchronous lookup — returns allowed values for a major category + Excel attribute name.
 * Returns null if grid not loaded or no entry found.
 * Call preloadMajCatGrid() first.
 */
export function getMajCatGridEntry(majorCategory: string, excelAttrName: string): string[] | null {
  if (!majCatGrid) return null;
  const catData = majCatGrid[majorCategory];
  if (!catData) return null;
  return catData[excelAttrName] ?? null;
}

export function isMajCatGridLoaded(): boolean {
  return majCatGrid !== null;
}

/** Returns true if the major category has ANY rows in the uploaded maj-cat grid. */
export function isMajCatInGrid(majorCategory: string): boolean {
  if (!majCatGrid) return false;
  return majorCategory in majCatGrid;
}

export function invalidateMajCatGrid(): void {
  majCatGrid = null;
  majCatGridPromise = null;
}

// ─── Mandatory Grid (from uploaded mandatory Excel) ────────────────────────────
// Structure: { [majorCategory]: { [sapKey]: { isActive: boolean; label: string | null } } }
// e.g.  { "MW_TEES_FS": { "M_FAB": { isActive: true, label: "WEAVE-01" }, ... }, ... }

type MandatoryGridEntry = { isActive: boolean; label: string | null };
type MandatoryGrid = Record<string, Record<string, MandatoryGridEntry>>;

let mandatoryGrid: MandatoryGrid | null = null;
let mandatoryGridPromise: Promise<MandatoryGrid> | null = null;

/**
 * Fetch the full mandatory grid from the backend (once per session).
 */
export async function preloadMandatoryGrid(): Promise<MandatoryGrid> {
  if (mandatoryGrid !== null) return mandatoryGrid;
  if (mandatoryGridPromise) return mandatoryGridPromise;

  const baseURL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  mandatoryGridPromise = fetch(`${baseURL}/article-config/mandatory-grid`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(r => r.ok ? r.json() : { data: {} })
    .then(json => {
      mandatoryGrid = (json?.data as MandatoryGrid) ?? {};
      return mandatoryGrid;
    })
    .catch(() => {
      mandatoryGrid = {};
      return mandatoryGrid as MandatoryGrid;
    })
    .finally(() => { mandatoryGridPromise = null; });

  return mandatoryGridPromise;
}

/**
 * Synchronous check — is a SAP key active (visible) for a major category?
 * Returns true if active, false if inactive, null if grid not loaded or category not found.
 */
export function isMandatoryGridFieldActive(majorCategory: string, sapKey: string): boolean | null {
  if (!mandatoryGrid) return null;
  const catData = mandatoryGrid[majorCategory];
  if (!catData) return null;
  const entry = catData[sapKey];
  if (!entry) return null;
  return entry.isActive;
}

/**
 * Returns the human-readable label for a SAP key from the mandatory grid
 * (Row 4 of the uploaded Excel). Returns null if not found.
 * The label is the same across all major categories — we just pick the first one found.
 */
export function getMandatoryGridFieldLabel(sapKey: string): string | null {
  if (!mandatoryGrid) return null;
  for (const catData of Object.values(mandatoryGrid)) {
    const entry = catData[sapKey];
    if (entry?.label) return entry.label;
  }
  return null;
}

export function isMandatoryGridLoaded(): boolean {
  return mandatoryGrid !== null;
}

/** Returns true if the major category has ANY rows in the uploaded mandatory grid. */
export function isMajCatInMandatoryGrid(majorCategory: string): boolean {
  if (!mandatoryGrid) return false;
  return majorCategory in mandatoryGrid;
}

export function invalidateMandatoryGrid(): void {
  mandatoryGrid = null;
  mandatoryGridPromise = null;
}
