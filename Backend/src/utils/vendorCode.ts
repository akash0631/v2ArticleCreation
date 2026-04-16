export function normalizeVendorCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (!text) return null;

  return /^\d{6}$/.test(text) ? text : null;
}

export function isValidVendorCode(value: unknown): boolean {
  if (value === null || value === undefined) return true;

  const text = String(value).trim();
  if (!text) return true;

  return /^\d{6}$/.test(text);
}

export function hasVendorCode(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== '';
}
