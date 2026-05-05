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
