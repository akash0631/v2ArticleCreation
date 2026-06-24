/**
 * Supabase `maj_cat_sizes` → SAP `ZART_GRID_VALUES` mirror.
 *
 * Supabase is SoT. This script pulls all ACT rows and upserts them into the
 * SAP-side validation table via `Z_ART_GRID_UPSERT_BATCH` over the RFC proxy.
 *
 * Designed to run as a cron (every 1h or daily — both are fine, FM is
 * idempotent and modifies-only).
 *
 * Env vars (all required, no defaults for safety):
 *   DATABASE_URL              postgres URL for Supabase Ai-auto-mdm project
 *   SAP_RFC_PROXY_URL         default https://sap-api.v2retail.net/api/rfc/proxy
 *   SAP_RFC_PROXY_KEY         default v2-rfc-proxy-2026
 *   SAP_RFC_PROXY_ENV         '' = DEV, 'qa' = QA, 'prod' = PROD (sync both if needed)
 *
 * Run:
 *   ts-node Backend/scripts/sync-zart-grid-values.ts
 *   SAP_RFC_PROXY_ENV=qa npx ts-node Backend/scripts/sync-zart-grid-values.ts
 */

import { Client } from 'pg';

const PROXY_URL = process.env.SAP_RFC_PROXY_URL || 'https://sap-api.v2retail.net/api/rfc/proxy';
const PROXY_KEY = process.env.SAP_RFC_PROXY_KEY || 'v2-rfc-proxy-2026';
const PROXY_ENV = process.env.SAP_RFC_PROXY_ENV || '';
const BATCH_SIZE = 200;

type Row = { MATKL: string; ATNAM: 'SIZE'; ATWRT: string; ACTIVE: 'X' };

async function pullSupabaseSot(): Promise<Row[]> {
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    try {
        const r = await pg.query<{ matkl: string; size: string }>(`
            SELECT DISTINCT LPAD(mc_code, 9, '0') AS matkl, UPPER(TRIM(size)) AS size
            FROM maj_cat_sizes
            WHERE status = 'ACT'
              AND mc_code IS NOT NULL AND TRIM(mc_code) <> ''
              AND size IS NOT NULL AND TRIM(size) <> ''
        `);
        return r.rows.map((x) => ({ MATKL: x.matkl, ATNAM: 'SIZE', ATWRT: x.size, ACTIVE: 'X' }));
    } finally {
        await pg.end();
    }
}

async function upsertBatch(rows: Row[]): Promise<{ in_: number; mod: number; rc: number; msg: string }> {
    const url = PROXY_ENV ? `${PROXY_URL}?env=${encodeURIComponent(PROXY_ENV)}` : PROXY_URL;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RFC-Key': PROXY_KEY },
        body: JSON.stringify({ bapiname: 'Z_ART_GRID_UPSERT_BATCH', IT_ROWS: rows }),
    });
    const j: any = await res.json();
    return {
        in_: Number(j?.EX_ROWS_IN ?? 0),
        mod: Number(j?.EX_ROWS_MODIFIED ?? 0),
        rc:  Number(j?.EX_RC ?? -1),
        msg: String(j?.EX_MSG ?? ''),
    };
}

async function main() {
    const env = PROXY_ENV || 'dev';
    console.log(`[zart-sync] target env=${env}`);

    const rows = await pullSupabaseSot();
    const distinctMatkls = new Set(rows.map((r) => r.MATKL)).size;
    console.log(`[zart-sync] pulled ${rows.length} rows across ${distinctMatkls} MATKLs from Supabase`);

    let totalIn = 0, totalMod = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const out = await upsertBatch(chunk);
        if (out.rc !== 0) {
            console.error(`[zart-sync] batch ${i} FAILED rc=${out.rc} msg=${out.msg}`);
            process.exitCode = 1;
            return;
        }
        totalIn += out.in_;
        totalMod += out.mod;
        console.log(`[zart-sync] batch ${i}: in=${out.in_} modified=${out.mod}`);
    }
    console.log(`[zart-sync] DONE env=${env} rows_in=${totalIn} modified=${totalMod}`);
}

main().catch((e) => {
    console.error('[zart-sync] fatal:', e);
    process.exit(1);
});
