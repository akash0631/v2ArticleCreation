/**
 * Grid snapping — enforce the per-major-category grid whitelist on extracted
 * values.
 *
 * VLMs frequently return a value that is semantically correct but not the
 * canonical grid token (e.g. "RINSE" when the grid only allows "RINSE_WSH").
 * Both the manual extraction page (enhancedExtractionController) and the SRM
 * auto-pipeline (srmSyncService) must snap returned values back onto the
 * category's grid values so the DB always stores grid-valid tokens.
 *
 * Shared so both paths use one implementation.
 */

/**
 * Snap an extracted value to the nearest per-category grid value.
 *
 * Returns the canonical grid value on an exact/normalized match, the best
 * fuzzy match when it is close enough, or null when no reasonable match
 * exists (caller stores null).
 */
export function snapValueToGrid(rawValue: string, allowed: string[]): string | null {
  const v = String(rawValue || '').trim();
  if (!v || !allowed || allowed.length === 0) return null;

  const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const nv = norm(v);
  if (!nv) return null;

  // 1) Exact (normalized) match → canonical grid value.
  for (const a of allowed) {
    if (norm(a) === nv) return a;
  }

  // 2) Fuzzy match: substring containment scored by overlap ratio, else
  //    Levenshtein similarity. Keep the best candidate above threshold.
  let best: string | null = null;
  let bestScore = 0;
  for (const a of allowed) {
    const na = norm(a);
    if (!na) continue;
    let score: number;
    if (na.includes(nv) || nv.includes(na)) {
      score = Math.min(na.length, nv.length) / Math.max(na.length, nv.length);
    } else {
      const dist = levenshtein(nv, na);
      score = 1 - dist / Math.max(nv.length, na.length);
    }
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }

  return bestScore >= 0.6 ? best : null;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}
