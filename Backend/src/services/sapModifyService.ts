/**
 * sapModifyService.ts
 *
 * Modifies an already-created (SAP-synced) article's attributes via the SAP
 * patch-bulk API. Used by the "Modify" action on the Created Articles page.
 *
 * Contract (per provided curl reference):
 *   POST https://sap-api.v2retail.net/api/article/patch-bulk?env=prod
 *   { "Items": [ { "Matnr": "<sapArticleId>", "Changes": { "M_FIT": "SLIM" } } ] }
 *
 * Success response:
 *   { "Status": true, "Total": 1, "Applied": 1, "Failed": 0,
 *     "Results": [ { "Index": 0, "Matnr": "...", "Ok": true, "ResultJson": "..." } ] }
 *
 * The caller persists to the local DB ONLY when ok === true.
 */

const SAP_PATCH_URL =
  process.env.SAP_PATCH_URL ||
  'https://sap-api.v2retail.net/api/article/patch-bulk?env=prod';

const SAP_PATCH_ENABLED =
  (process.env.SAP_PATCH_ENABLED ?? process.env.SAP_SYNC_ENABLED ?? 'true').toLowerCase() === 'true';

export interface SapPatchResult {
  ok: boolean;
  applied: number;
  failed: number;
  message: string;
  raw?: unknown;
}

interface PatchBulkResponse {
  Status?: boolean | string;
  Total?: number;
  Applied?: number;
  Failed?: number;
  Message?: string;
  Results?: Array<{
    Index?: number;
    Matnr?: string;
    Ok?: boolean;
    Error?: string;
    Message?: string;
    ResultJson?: string;
  }>;
}

/**
 * Push a set of attribute changes for a single article to SAP.
 *
 * @param matnr   SAP article number (extractionResultFlat.sapArticleId)
 * @param changes { SAP_KEY: value } — e.g. { M_FIT: 'SLIM', MRP: '750' }
 */
export async function patchArticleAttributes(
  matnr: string,
  changes: Record<string, string>,
): Promise<SapPatchResult> {
  if (!SAP_PATCH_ENABLED) {
    return { ok: false, applied: 0, failed: 0, message: 'SAP patch-bulk is disabled (SAP_PATCH_ENABLED=false)' };
  }
  if (!matnr) {
    return { ok: false, applied: 0, failed: 0, message: 'Missing SAP article number (Matnr)' };
  }
  if (!changes || Object.keys(changes).length === 0) {
    return { ok: false, applied: 0, failed: 0, message: 'No changes to apply' };
  }

  const requestBody = { Items: [{ Matnr: matnr, Changes: changes }] };

  console.log(`\n========== [SAP PATCH] patch-bulk for Matnr=${matnr} ==========`);
  console.log(`API URL : ${SAP_PATCH_URL}`);
  console.log(JSON.stringify(requestBody, null, 2));
  console.log(`==============================================================\n`);

  let response: Response;
  try {
    response = await fetch(SAP_PATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown network error';
    console.error(`[SAP PATCH] Network error for Matnr=${matnr}:`, msg);
    return { ok: false, applied: 0, failed: 0, message: `SAP patch-bulk network error: ${msg}` };
  }

  const responseText = await response.text();
  console.log(`[SAP PATCH] RAW response (status=${response.status}) for Matnr=${matnr}:`, responseText);

  let parsed: PatchBulkResponse | null = null;
  try {
    parsed = JSON.parse(responseText) as PatchBulkResponse;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return {
      ok: false,
      applied: 0,
      failed: 0,
      message: `SAP patch-bulk returned non-JSON (HTTP ${response.status}): ${responseText.slice(0, 300)}`,
    };
  }

  const statusOk = parsed.Status === true || String(parsed.Status).toLowerCase() === 'true';
  const applied = Number(parsed.Applied ?? 0);
  const failed = Number(parsed.Failed ?? 0);
  const results = Array.isArray(parsed.Results) ? parsed.Results : [];
  const everyResultOk = results.length > 0 && results.every((r) => r.Ok === true);

  const ok = response.ok && statusOk && failed === 0 && everyResultOk;

  let message: string;
  if (ok) {
    message = `SAP applied ${applied} change${applied === 1 ? '' : 's'}.`;
  } else {
    // Surface per-item / per-result errors so the user can fix the value.
    const errs = results
      .filter((r) => r.Ok !== true)
      .map((r) => r.Error || r.Message || r.ResultJson)
      .filter(Boolean);
    message =
      errs.join('; ') ||
      parsed.Message ||
      `SAP rejected the modification (HTTP ${response.status}, Status=${String(parsed.Status)}, Failed=${failed}).`;
  }

  return { ok, applied, failed, message, raw: parsed };
}
