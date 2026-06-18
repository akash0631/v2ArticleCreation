# Attribute Write Path — Standard SAP Only

Date: 2026-06-17
Status: Active rule. Deprecates the legacy `ZCT04_CHARACTER` write path.

## The rule

The Article-Creation app writes article characteristic attributes to **standard SAP tables only**:

- `AUSP` (KLART=026) — per-object characteristic values, keyed by CUOBJ via INOB
- `CABN` / `CABNT` / `CAWN` / `CAWNT` — the catalog, maintained in SAP `CT04` by the MDM team
- `KLAH` / `KSML` / `KSSK` — class master + characteristic membership, maintained in `CL02`

The legacy `ZCT04_CHARACTER` denormalized table is **deprecated**:

- No new writes from this codebase.
- No new columns to be added.
- Existing data is left in place for downstream consumers that have not yet migrated, but it is read-only from this app's perspective.

## Why

`ZCT04_CHARACTER` existed because direct `AUSP` writes were operationally risky before the V64 + link-chain pattern landed. Specifically: `Z_ART_PATCH_RFC_V61` picked one class per matnr via `SELECT SINGLE` on KSSK, which missed the modern class when both legacy and modern were linked, so writes silently went to the wrong target. `Z_ART_PATCH_RFC_V64` (built 2026-06-16) enumerates all classes via `SELECT INTO TABLE`, picks the one with the attribute in `KSML`, and writes to standard `AUSP`. Combined with `Z_LINK_MATNR_CLASS` (atomic class link + `BAPI_TRANSACTION_COMMIT`), the AUSP path is now safe and proven on PROD (100% AUSP, 0 ZCT04 on the 2026-06-16 verification run).

Standardizing on `AUSP` simplifies every downstream consumer — `Z_SB_ARTICLE` OData, Snowflake BRONZE/GOLD, HHT, Power BI, the allocation engine — all read from `AUSP`. Continuing to write `ZCT04` would mean every consumer needs to UNION the two tables and resolve conflicts. Stopping the ZCT04 write halves that surface.

## What changed in this PR

| Removed | Reason |
|---|---|
| `Backend/scripts/extract-sap-unique-values.ts` | Pulled unique values from `ET_ZCT04_CHAR_GET_RFC` (ZCT04 dump endpoint). New direction is reverse: Supabase → SAP. |
| `Backend/scripts/sync-sap-attribute-values.ts` | Synced ZCT04 attribute values into Prisma. Same reason. |
| `Backend/outputs/sap-column-attribute-mapping.json` | Snapshot of ZCT04 → master-attribute mapping. Not used at runtime. |
| `Backend/outputs/sap-unique-values-by-column.json` | Snapshot of ZCT04 unique values. Not used at runtime. |
| `package.json` scripts `sap:unique-values`, `sap:sync`, `sap:sync:daily` | Wrappers around the removed scripts. |

## What replaces it

- Per-article attribute write: `Backend/src/services/sapAttributePushService.ts` (added in PR 1) — runs the V64 chain after `ZMM_ART_CREATION_RFC` creates the article.
- Master/catalog data direction (next session): Supabase `maj_cat_grid_values` is the source of truth for MC × attribute × allowed value; a sync worker will push this to SAP (`CAWN` / `KSML`) after reconciliation with current SAP state. See the next-session spec PR for the reconciliation plan.

## How to find what's left

```bash
# Should return only this doc and Obsidian/handover history.
grep -r "ZCT04\|zct04" Backend/ Frontend/ --include="*.ts" --include="*.tsx" --include="*.js"
```

## References

- `docs/UDIT_HANDOVER_ARTICLE_SOT.md` §2 (Attribute Source of Truth) and §7 (V61 vs V62 vs V64).
- Obsidian: `v2retail/HANDOVER-V64-LINK-CHAIN-2026-06-16.md`, `v2retail/247K Article PROD Patch 2026-06-15.md`.
