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

// Fixed SAP org values — do not change per variant
const SAP_SITE       = process.env.SAP_SITE        || 'DH24';
const SAP_PUR_GRP    = process.env.SAP_PUR_GRP     || '124';
const SAP_SALES_ORG  = process.env.SAP_SALES_ORG   || '1100';
const SAP_SALES_UNIT = process.env.SAP_SALES_UNIT  || 'EA';
const SAP_TO_DATE    = process.env.SAP_TO_DATE      || '31129999';
const SAP_TAX_CODE   = process.env.SAP_TAX_CODE    || 'J2';

// ─── Types ────────────────────────────────────────────────────────────────────

type FlatVariant = {
    id: string;
    genericArticleId?: string | null;
    variantSize?: string | null;
    variantColor?: string | null;
    colour?: string | null;
    vendorCode?: string | null;
    rate?: unknown;       // NET_PRICE
    mrp?: unknown;        // MRP_TYPE
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

/** Build the JSON payload for one variant RFC call */
function buildVariantPayload(
    genericSapArtNum: string,
    variant: FlatVariant
): Record<string, string> {
    // FROM_DATE: today in DDMMYYYY format
    const now = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const fromDate = `${dd}${mm}${yyyy}`;

    return {
        // ── Dynamic — from variant record ─────────────────
        GENERIC_ARTICLE: genericSapArtNum,
        VAR1VAL1:        toStr(variant.variantSize),            // actual size value e.g. "XL"
        VAR1VAL2:        toStr(variant.colour ?? variant.variantColor), // actual color e.g. "Blue"
        VENDOR:          toStr(variant.vendorCode),
        NET_PRICE:       toStr(variant.rate),
        MRP_TYPE:        toStr(variant.mrp),
        FROM_DATE:       fromDate,
        // ── Fixed SAP org values ──────────────────────────
        VARIANT_ARTICLE: '',
        VAR1CHAR1:       'V2_SIZE',
        VAR1CHAR2:       'V2_COLOR',
        SITE:            SAP_SITE,
        PUR_GRP:         SAP_PUR_GRP,
        SALES_ORG:       SAP_SALES_ORG,
        SALES_UNIT:      SAP_SALES_UNIT,
        TO_DATE:         SAP_TO_DATE,
        OLD_MAT_NO:      '',
        TAX_CODE:        SAP_TAX_CODE,
    };
}

/** Parse the RFC JSON response into a normalised outcome */
function parseVariantRfcResponse(
    statusCode: number,
    body: string
): { ok: boolean; sapArticleNumber?: string; fabricArticleNumber?: string; fabricArticleDescription?: string; message: string } {
    let parsed: Record<string, unknown> | undefined;

    try {
        parsed = JSON.parse(body);
    } catch {
        return {
            ok: false,
            message: body.trim() || `SAP returned HTTP ${statusCode} with no body`,
        };
    }

    // SAP returns article number in FIELD (primary), fall back to legacy keys
    const sapArt = toStr(
        parsed?.FIELD ??
        parsed?.SAP_ART ??
        parsed?.VARIANT_ARTICLE ??
        parsed?.ArticleNumber ??
        parsed?.ARTICLE_NUMBER ??
        ''
    );

    // sapMessage is the human-readable success/error text from SAP
    const sapMessageText = toStr(parsed?.sapMessage ?? parsed?.Message ?? parsed?.MESSAGE ?? parsed?.message ?? parsed?.MSG ?? '');
    const msgTyp  = toStr(parsed?.MSG_TYP ?? '').toUpperCase();
    // sapType "S" = success, "E" = error (SAP standard)
    const sapType = toStr(parsed?.sapType ?? parsed?.SAPTYPE ?? '').toUpperCase();
    const statusFlag = parsed?.Status ?? parsed?.status;

    // Build human-readable message — prefer sapMessage, fall back to MSG
    const message = sapMessageText ||
        (sapArt ? `Variant created: ${sapArt}` : `SAP response HTTP ${statusCode} — ${JSON.stringify(parsed)}`);

    const isHttpOk     = statusCode >= 200 && statusCode < 300;
    const isStatusOk   = statusFlag !== false && statusFlag !== 'false' && statusFlag !== 0 && statusFlag !== '0';
    const isSapTypeOk  = !sapType || sapType === 'S' || sapType === 'SUCCESS';
    const isBusinessOk = isStatusOk && isSapTypeOk && msgTyp !== 'E' && msgTyp !== 'ERROR';
    // If FIELD/article number is present treat as success regardless
    const ok = isHttpOk && (sapArt ? true : isBusinessOk);

    return {
        ok,
        sapArticleNumber:       sapArt || undefined,
        fabricArticleNumber:    sapArt || undefined,       // FIELD value = variant SAP article
        fabricArticleDescription: sapMessageText || undefined,
        message,
    };
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
                ` VAR1VAL1=${payload.VAR1VAL1} VAR1VAL2=${payload.VAR1VAL2}` +
                ` VENDOR=${payload.VENDOR} NET_PRICE=${payload.NET_PRICE} MRP_TYPE=${payload.MRP_TYPE}` +
                ` FROM_DATE=${payload.FROM_DATE} variantDbId=${variant.id}`
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
                        ` fabricArticleNumber=${outcome.fabricArticleNumber ?? '-'}` +
                        ` for variantId=${variant.id}`
                    );
                    results.push({
                        id: variant.id,
                        success: true,
                        statusCode: response.status,
                        message: outcome.message,
                        sapArticleNumber: outcome.sapArticleNumber,
                        fabricArticleNumber: outcome.fabricArticleNumber,
                        fabricArticleDescription: outcome.fabricArticleDescription,
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
