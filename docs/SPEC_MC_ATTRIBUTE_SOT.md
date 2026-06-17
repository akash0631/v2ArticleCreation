# Spec — MC × Attribute Source of Truth + Supabase↔SAP Reconciliation

Status: **Draft — for review.** No code in this PR. Implementation lands in a follow-up session after sign-off.
Date: 2026-06-17
Owner: Udit Malik (app side) + Akash Agarwal (SAP side)
Supersedes scope of: `SIZE_VALIDATION_HANDOVER_2026-06-12` (was size×MC only — this expands to **all attributes** × MC)

## 1. Background

Each Major Category (MC) in V2 Retail has a controlled set of allowed values for many characteristic attributes — not just `SIZE`. Examples for `JB_TEES_FS` (kids tees full-sleeve):

- `SIZE` ∈ {`2-3Y`, `4-5Y`, `6-7Y`, ...}
- `M_COLLAR_TYPE` ∈ {`RND`, `V`, `POLO`}
- `M_FAB_MAIN_MVGR_1` ∈ {`KNT_SLD`, `KNT_PRT`, `WVN_SLD`, ...}
- `M_NECK_BAND` ∈ {`Y`, `N`}
- ...and so on for every attribute defined in the matching SAP class

Today:
- **App side**: `Supabase.maj_cat_grid_values` holds **only `ATNAM='SIZE'`** rows (1,515 ACT). Other attributes are not validated against MC at all — buyer can put `M_COLLAR_TYPE=ANYTHING_GOES` and the app accepts it. SAP `Z_ART_PATCH_RFC_V64` will later reject the bad value with `NIC` (Not In Class), but the app does not pre-empt the rejection.
- **SAP side**: `CABN` (characteristic master) + `CAWN` (allowed values per characteristic) + `KSML` (which characteristics are in each class) + `KLAH` (class master). This is the canonical SAP rule set, maintained by the MDM team in tcode `CT04` (characteristic) and `CL02` (class).
- The two sides are **not reconciled**. We do not know how many values exist in SAP `CAWN` that are missing from Supabase, or vice versa.

## 2. Decision (user direction, 2026-06-17)

> Supabase is the source of truth. SAP is updated from there. **First reconcile differences, then push Supabase truth into SAP.**

Implications:

1. **Schema:** `maj_cat_grid_values` already supports all attrs (key = `MANDT + MATKL + ATNAM + ATWRT`). No schema change needed — just populate for `ATNAM != 'SIZE'`.
2. **Reconciliation:** before we push, we need a side-by-side diff: per `(MATKL, ATNAM, ATWRT)`, is it in Supabase only, SAP only, or both?
3. **Enforcement:** app must hard-block (422) any save where `(MC, attribute, value)` is not in Supabase's allowed set. Same rule, same SoT, both surfaces.
4. **Sync direction:** Supabase → SAP via the existing `Z_ART_GRID_UPSERT_BATCH` FM (already PROD-ready for SIZE; extends naturally to other ATNAMs because the FM is keyed on `ATNAM`). Plus SAP-side `CAWN` upsert if a value exists in Supabase but not in SAP's class master.

## 3. Architecture (proposed)

```
┌───────────── Supabase (SoT) ─────────────┐
│ maj_cat_grid_values                       │
│ (MATKL, ATNAM, ATWRT, ACTIVE)             │
│ Planning UI edits rules                   │
└──┬───────────────────────────────────────┘
   │ (a) backend RPCs                        (c) sync worker
   │     - is_value_allowed                       (Cloudflare cron)
   │     - get_allowed_values                  ┌─► CAWN upsert (FM)
   │     - validate_attribute_set              │   if value missing from class master
   │     - reconcile_with_sap                  │
   ▼                                           ▼
┌─ Backend (Node) ────────────┐    ┌──── SAP (S/4 HANA) ────────────┐
│ /api/variants/validate-set  │    │ Z_ART_GRID_UPSERT_BATCH         │
│ /api/mc-attributes/allowed  │    │ (already PROD-ready for SIZE)   │
│ /api/admin/reconcile        │    │                                 │
│                             │    │ CAWN / KSML / KLAH              │
│ Validates EVERY attr        │    │ (MDM team owns)                 │
│ on variant save (422)       │    │                                 │
└─────────────────────────────┘    └─────────────────────────────────┘
```

## 4. Phase plan

### Phase 0 — Reconciliation snapshot (read-only, no writes)

Goal: produce a single CSV / Snowflake table showing the drift between Supabase and SAP for every `(MC, attribute, value)`. Planning + MDM team review this before any push.

Steps:

1. Build `Backend/scripts/reconcile-mc-attributes.ts` that:
   - For each MC in Supabase (303 MCs today): fetch class master from SAP via `RFC_READ_TABLE` on `KLAH` (by MATKL = MC), then `KSML` (characteristics in class), then `CAWN` / `CAWNT` (allowed values per characteristic).
   - For each MC in Supabase: query `maj_cat_grid_values` for all rows.
   - Compute per `(MATKL, ATNAM, ATWRT)`:
     - `IN_BOTH`
     - `SUPABASE_ONLY` — app has rule, SAP doesn't (need to push)
     - `SAP_ONLY` — SAP has value, app doesn't (need to import OR planning explicitly excluded it)
2. Write output to `Backend/outputs/reconcile-mc-attributes.csv` and a summary `Backend/outputs/reconcile-summary.md` with counts per MC and per ATNAM.
3. Share with planning + MDM team for review.

Expected output shape (~rows depend on how many ATNAMs we extend to):

```
MATKL,ATNAM,ATWRT,STATUS,SUPABASE_ACTIVE,SAP_ATFLB
JB_TEES_FS,SIZE,2-3Y,IN_BOTH,X,X
JB_TEES_FS,SIZE,3XL,SUPABASE_ONLY,X,(none)
JB_TEES_FS,M_COLLAR_TYPE,RND,IN_BOTH,X,X
JB_TEES_FS,M_COLLAR_TYPE,V,SAP_ONLY,(none),X
JB_TEES_FS,M_COLLAR_TYPE,POLO,IN_BOTH,X,X
JB_TEES_FS,M_FAB_MAIN_MVGR_1,KNT_SLD,IN_BOTH,X,X
JB_TEES_FS,M_FAB_MAIN_MVGR_1,WVN_SLD,SUPABASE_ONLY,X,(none)
...
```

**Risk:** snapshot has ~50K-100K rows once all attrs are in scope (303 MCs × ~30 attrs × ~5 avg values). Plan for paginated `RFC_READ_TABLE` runs (proven pattern from `bulk_patch_diff.py`).

### Phase 1 — Schema confirmation (Supabase)

`maj_cat_grid_values` already supports any `ATNAM`. Confirm RLS is off (or service-role can write). No DDL change.

Add 3 generalized RPCs:

```sql
-- existing (keep for backwards compat): is_size_allowed, get_allowed_sizes, validate_variant_sizes
-- new:
create or replace function is_value_allowed(
  p_major_category text,
  p_atnam text,
  p_atwrt text
) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.maj_cat_grid_values
    where upper(trim(matkl)) = upper(trim(p_major_category))
      and upper(trim(atnam)) = upper(trim(p_atnam))
      and upper(trim(atwrt)) = upper(trim(p_atwrt))
      and active = 'X'
  );
$$;

create or replace function get_allowed_values(
  p_major_category text,
  p_atnam text
) returns table(atwrt text)
language sql stable as $$
  select atwrt from public.maj_cat_grid_values
  where upper(trim(matkl)) = upper(trim(p_major_category))
    and upper(trim(atnam)) = upper(trim(p_atnam))
    and active = 'X'
  order by atwrt;
$$;

create or replace function validate_attribute_set(
  p_major_category text,
  p_attrs jsonb  -- [{"atnam":"SIZE","atwrt":"2-3Y"}, {"atnam":"M_COLLAR_TYPE","atwrt":"RND"}, ...]
) returns table(atnam text, atwrt text, is_allowed boolean)
language sql stable as $$
  select
    (a->>'atnam')::text as atnam,
    (a->>'atwrt')::text as atwrt,
    exists (
      select 1 from public.maj_cat_grid_values g
      where upper(trim(g.matkl)) = upper(trim(p_major_category))
        and upper(trim(g.atnam)) = upper(trim((a->>'atnam')::text))
        and upper(trim(g.atwrt)) = upper(trim((a->>'atwrt')::text))
        and g.active = 'X'
    ) as is_allowed
  from jsonb_array_elements(p_attrs) as a;
$$;

grant execute on function is_value_allowed(text,text,text) to anon, authenticated, service_role;
grant execute on function get_allowed_values(text,text) to anon, authenticated, service_role;
grant execute on function validate_attribute_set(text,jsonb) to anon, authenticated, service_role;
```

### Phase 2 — Backend enforcement

Add `Backend/src/services/mcAttributeValidationService.ts`:

```ts
export async function validateAttributeSet(
  majCat: string,
  attrs: Array<{ atnam: string; atwrt: string }>
): Promise<{ ok: boolean; invalid: Array<{ atnam: string; atwrt: string }> }> { ... }
```

Hook into:

- **Variant save** (`ApproverController.updateItem` / variant POST): build the attr set from the item's M_* fields + SIZE + COLOUR; call `validateAttributeSet`; on any `is_allowed=false`, return `422` with the invalid list and a hint to contact MDM if planning is sure the value should be allowed.
- **Bulk xlsx upload**: same call per-row, return a consolidated error response listing each invalid `(row, attr, value)` so the user can fix the xlsx in one pass.
- **Frontend dropdown population** (next phase) reads `get_allowed_values` via a backend proxy endpoint.

New routes:

- `GET /api/mc-attributes/allowed?mc=<MC>&atnam=<ATNAM>` → calls `get_allowed_values`, returns array of strings.
- `POST /api/mc-attributes/validate-set` → calls `validate_attribute_set`, returns the invalid list.

These sit behind the existing approver auth. Service-role Supabase key stays server-side; frontend never sees it.

### Phase 3 — Frontend dropdowns (defense-in-depth)

For each `M_*` attribute in the variant edit cell:

- `useEffect` on selected MC fetches `/api/mc-attributes/allowed?mc=<MC>&atnam=<ATNAM>` and populates the `<Select>`.
- If the API returns empty (MC not in Supabase yet OR attribute not configured for this MC): show "No allowed values configured. Contact planning." Frontend allows free-text only if planning team has explicitly opted in for that attr (admin flag).

Component candidates to patch: `Frontend/src/features/extraction/components/AttributeCell.tsx`, `Frontend/src/features/approver/components/VariantSubTable.tsx`. Confirm in implementation session.

### Phase 4 — Reverse sync (Supabase → SAP)

Once planning approves the reconciled state:

- New CF Worker cron `mc-attribute-sync-worker` (or extend existing universal-mcp):
  - Read Supabase `maj_cat_grid_values` rows updated since last run (use `UPDATED_AT`).
  - For each `(MATKL, ATNAM, ATWRT, ACTIVE)`:
    - If value missing from SAP `CAWN`: call `Z_CAWN_UPSERT` (FM to be built — wraps standard `BAPI_CHARACT_CHANGE` or direct DDIC).
    - If value missing from SAP `KSML` for class: call `Z_KSML_UPSERT` (FM to be built).
    - Upsert into `ZART_GRID_VALUES` via existing `Z_ART_GRID_UPSERT_BATCH`.
  - Log every push to `Backend/outputs/sync-history-YYYYMMDD.jsonl` for audit.

Frequency: daily off-hours initially; can move to event-driven (Supabase webhook) later.

### Phase 5 — Operational

- **Telegram alert** on reconciliation drift > N rows since last run.
- **Admin UI** in app to view drift + force-sync.
- **Runbook** for MDM team: what to do when V64 returns NIC for a value the buyer expected to work.

## 5. Open questions (need answers before implementation)

1. **Attribute scope.** Which ATNAMs are in scope for the first round? Suggestion: `SIZE`, `M_COLLAR_TYPE`, `M_FAB_MAIN_MVGR_1`, `M_FAB_MAIN_MVGR_2`, `M_WEAVE_01`, `M_NECK_BAND`, `M_SLEEVE_STYLE`, `M_FIT`, `M_BODY_STYLE`. ~10 attrs. Expand later.
2. **MC scope.** All 303 MCs in one go, or a 5-MC pilot first?
3. **Conflict resolution.** When `SAP_ONLY` value exists, default policy: import into Supabase (treat SAP as the historical seed), or drop from SAP (treat absence in Supabase as "planning removed it")? Suggestion: **import on first reconciliation, then app is authoritative**.
4. **Frontend dropdown UX.** When Supabase returns empty list for an attribute, hide the field, disable the field, or show free-text with a warning? Suggestion: **disable + warning**, force MDM to add the value first.
5. **Audit retention.** How long do we keep `sync-history-*.jsonl`? Suggestion: 90 days local, then archive to Snowflake `BRONZE.MC_ATTRIBUTE_SYNC_HISTORY`.
6. **MDM tooling.** Does MDM team want a UI inside Article-Creation app to edit `maj_cat_grid_values`, or do they keep editing in Supabase Studio? Suggestion: app UI in Phase 5 once stable.

## 6. Effort estimate

- Phase 0 (reconciliation snapshot): **1 day** (build script, run, share output).
- Phase 1 (Supabase RPCs): **1 hour**.
- Phase 2 (backend validation hook): **3-4 hours** including tests.
- Phase 3 (frontend dropdowns): **3-4 hours** for the existing variant edit + bulk upload screens.
- Phase 4 (sync worker + 2 new SAP FMs): **1-2 days** (SAP-side FM build for CAWN/KSML upsert is the slow part).
- Phase 5 (operational polish): **1 day** spread across post-go-live week.

**Total to GA: ~5 working days** across Udit (Phases 2-3) and Akash (Phases 0, 4) with planning/MDM sign-off between Phase 0 and Phase 1.

## 7. Out of scope for this spec

- Attribute master itself (the canonical list of ATNAMs and their data types). That's `master-attributes.json` in this repo, owned by Udit.
- The image extraction prompt logic (Gemini VLM). Untouched.
- The per-article V64 push (PR #2 of this series). Untouched. That happens **after** the article is approved, and only writes attributes that were already validated on save. So this spec is the prerequisite that prevents bad data from ever reaching V64.
- Granular per-buyer permissions on which MCs they can edit. Out of scope; future.

## 8. References

- Handover doc: `docs/UDIT_HANDOVER_ARTICLE_SOT.md` (PR #1)
- V64 attribute push: `Backend/src/services/sapAttributePushService.ts` (PR #2 of this series)
- ZCT04 deprecation: `docs/ATTRIBUTE_WRITE_PATH.md` (PR #3 of this series)
- Obsidian: `v2retail/zart-grid-size-sot.md`, `v2retail/HANDOVER-V64-LINK-CHAIN-2026-06-16.md`
- Existing SIZE-only SoT: Supabase project `Ai-auto-mdm` (`hgdftqswlvkspzjtlrll`), table `maj_cat_grid_values`, 1515 rows, RPCs `is_size_allowed` / `get_allowed_sizes` / `validate_variant_sizes`.

## 9. Decision log

| Date | Decision | Maker |
|---|---|---|
| 2026-06-17 | Supabase = SoT. Reconcile first, then push. | Akash |
| 2026-06-17 | Hard-block 422 on validation failure. | Akash |
| 2026-06-17 | Ship V64 push (PR #2) + ZCT04 cleanup (PR #3) first. Defer MC-attr SoT to next session. | Akash |
| TBD | Attribute scope (first round). | Udit + MDM team |
| TBD | MC scope (303 vs pilot). | Akash |
| TBD | Conflict resolution policy on `SAP_ONLY` rows. | Akash + planning |
