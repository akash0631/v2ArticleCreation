/**
 * zmmVarArtCreationService.ts
 *
 * SAP RFC integration for Variant Article Creation.
 * Calls ZMM_VAR_ART_CREATION_RFC with a JSON body after a generic article
 * is successfully created via ZMM_ART_CREATION_RFC.
 *
 * Each variant gets its own RFC call with:
 *   GENERIC_ARTICLE  = SAP article number returned from generic creation
 *   VAR1CHAR1/VAR1VAL1 = V2_SIZE / size value
 *   VAR1CHAR2/VAR1VAL2 = V2_COLOR / color value
 *   + pricing, vendor, and static org fields
 */

import type { SapSyncItemResult } from './sapSyncService';

// ─── Config ───────────────────────────────────────────────────────────────────

const ZMM_VAR_RFC_URL =
    process.env.ZMM_VAR_RFC_URL ||
    'http://192.168.151.36:9005/api/ZMM_VAR_ART_CREATION_RFC';

const ZMM_VAR_RFC_ENABLED =
    (process.env.ZMM_RFC_ENABLED ?? process.env.SAP_SYNC_ENABLED ?? 'true').toLowerCase() === 'true';

// Static org fields — override via env vars if needed
const SITE      = process.env.SAP_VARIANT_SITE      || 'DH24';
const PUR_GRP   = process.env.SAP_VARIANT_PUR_GRP   || '124';
const SALES_ORG = process.env.SAP_VARIANT_SALES_ORG || '1100';
const TO_DATE   = '31129999';

// ─── Types ────────────────────────────────────────────────────────────────────

type FlatVariant = {
    id: string;
    genericArticleId?: string | null;
    variantSize?: string | null;
    variantColor?: string | null;
    vendorCode?: string | null;
    rate?: unknown;       // NET_PRICE
    mrp?: unknown;        // MRP_TYPE
    hsnTaxCode?: string | null;
    [key: string]: unknown;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toStr = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    // Prisma Decimal → plain number string
    if (typeof v === 'object' && typeof (v as any).toNumber === 'function') {
        const n: number = (v as any).toNumber();
        return isNaN(n) ? '' : String(n);
    }
    return String(v).trim();
};

/** Returns today's date formatted as DDMMYYYY (e.g. "30042026") */
const getTodayDDMMYYYY = (): string => {
    const d = new Date();
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}${mm}${yyyy}`;
};

/** Build the JSON payload for one variant RFC call */
function buildVariantPayload(
    genericSapArtNum: string,
    variant: FlatVariant
): Record<string, string> {
    return {
        GENERIC_ARTICLE: genericSapArtNum,
        VARIANT_ARTICLE: '',            // SAP generates this
        VAR1CHAR1:  'V2_SIZE',
        VAR1VAL1:   toStr(variant.variantSize),
        VAR1CHAR2:  'V2_COLOR',
        VAR1VAL2:   toStr(variant.variantColor),
        VENDOR:     toStr(variant.vendorCode),
        SITE,
        PUR_GRP,
        NET_PRICE:  toStr(variant.rate),
        SALES_ORG,
        SALES_UNIT: 'EA',
        MRP_TYPE:   toStr(variant.mrp),
        FROM_DATE:  getTodayDDMMYYYY(),
        TO_DATE,
        OLD_MAT_NO: '',
        TAX_CODE:   toStr(variant.hsnTaxCode),
    };
}

/** Parse the RFC JSON response into a normalised outcome */
function parseVariantRfcResponse(
    statusCode: number,
    body: string
): { ok: boolean; sapArticleNumber?: string; message: string } {
    let parsed: Record<string, unknown> | undefined;

    try {
        parsed = JSON.parse(body);
    } catch {
        return {
            ok: false,
            message: body.trim() || `SAP returned HTTP ${statusCode} with no body`,
        };
    }

    // SAP may return the variant article number under different keys
    const sapArt = toStr(
        parsed?.SAP_ART ??
        parsed?.VARIANT_ARTICLE ??
        parsed?.ArticleNumber ??
        parsed?.ARTICLE_NUMBER ??
        ''
    );
    const msgTyp  = toStr(parsed?.MSG_TYP ?? '').toUpperCase();
    const msgText = toStr(parsed?.MESSAGE ?? parsed?.Message ?? parsed?.message ?? parsed?.MSG ?? '');
    const statusFlag = parsed?.Status ?? parsed?.status;

    // Build human-readable message
    const parts: string[] = [];
    if (msgTyp)  parts.push(`[${msgTyp}]`);
    if (msgText) parts.push(msgText);
    const message = parts.join(' ') ||
        (sapArt ? `Variant created: ${sapArt}` : `SAP response HTTP ${statusCode} — ${JSON.stringify(parsed)}`);

    const isHttpOk     = statusCode >= 200 && statusCode < 300;
    const isStatusOk   = statusFlag !== false && statusFlag !== 'false' && statusFlag !== 0 && statusFlag !== '0';
    const isBusinessOk = isStatusOk && msgTyp !== 'E' && msgTyp !== 'ERROR';
    // If SAP returned an article number treat as success regardless of MSG_TYP
    const ok = isHttpOk && (sapArt ? true : isBusinessOk);

    return { ok, sapArticleNumber: sapArt || undefined, message };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Calls ZMM_VAR_ART_CREATION_RFC for every variant in the map.
 *
 * @param variantsByGenericId  Map<genericDbId, FlatVariant[]>
 * @param genericSapArticleMap Map<genericDbId, sapArticleNumber>  (from generic creation results)
 */
export async function syncVariantsToSapViaRfc(
    variantsByGenericId: Map<string, FlatVariant[]>,
    genericSapArticleMap: Map<string, string>
): Promise<SapSyncItemResult[]> {
    if (!ZMM_VAR_RFC_ENABLED) {
        console.log('[ZMM_VAR_RFC] Disabled via ZMM_RFC_ENABLED / SAP_SYNC_ENABLED env var');
        const results: SapSyncItemResult[] = [];
        for (const variants of variantsByGenericId.values()) {
            for (const v of variants) {
                results.push({ id: v.id, success: false, message: 'ZMM_VAR_ART_CREATION_RFC sync is disabled' });
            }
        }
        return results;
    }

    const results: SapSyncItemResult[] = [];

    for (const [genericId, variants] of variantsByGenericId) {
        const genericSapArt = genericSapArticleMap.get(genericId);

        if (!genericSapArt) {
            // Generic creation failed or returned no article number — skip variants
            console.warn(`[ZMM_VAR_RFC] Skipping ${variants.length} variant(s) for genericId=${genericId}: no SAP article number`);
            for (const v of variants) {
                results.push({ id: v.id, success: false, message: 'Generic article SAP number not available; variant skipped' });
            }
            continue;
        }

        for (const variant of variants) {
            const payload = buildVariantPayload(genericSapArt, variant);

            console.log(
                `[ZMM_VAR_RFC] Creating variant → GENERIC_ARTICLE=${genericSapArt}` +
                ` SIZE=${payload.VAR1VAL1} COLOR=${payload.VAR1VAL2}` +
                ` VENDOR=${payload.VENDOR} NET_PRICE=${payload.NET_PRICE} MRP=${payload.MRP_TYPE}` +
                ` TAX_CODE=${payload.TAX_CODE} variantDbId=${variant.id}`
            );

            try {
                const response = await fetch(ZMM_VAR_RFC_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const responseText = await response.text();
                console.log(
                    `[ZMM_VAR_RFC] RAW SAP response (status=${response.status}) for variantId=${variant.id}:`,
                    responseText
                );

                const outcome = parseVariantRfcResponse(response.status, responseText);

                if (outcome.ok) {
                    console.log(
                        `[ZMM_VAR_RFC] ✅ Variant created: ${outcome.sapArticleNumber ?? 'no art num'}` +
                        ` for variantId=${variant.id}`
                    );
                    results.push({
                        id: variant.id,
                        success: true,
                        statusCode: response.status,
                        message: outcome.message,
                        sapArticleNumber: outcome.sapArticleNumber,
                    });
                } else {
                    console.warn(`[ZMM_VAR_RFC] ❌ SAP rejected variantId=${variant.id}: ${outcome.message}`);
                    results.push({
                        id: variant.id,
                        success: false,
                        statusCode: response.status,
                        message: outcome.message,
                    });
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown network error';
                console.error(`[ZMM_VAR_RFC] Network error for variantId=${variant.id}:`, msg);
                results.push({
                    id: variant.id,
                    success: false,
                    message: `ZMM_VAR_ART_CREATION_RFC network error: ${msg}`,
                });
            }
        }
    }

    return results;
}
