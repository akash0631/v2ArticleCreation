# Size×MC Validation — Integration Guide

**Status:** LIVE on Supabase project `hgdftqswlvkspzjtlrll` (Ai-auto-mdm), `public` schema.
**Date:** 2026-06-09
**Source:** `Copy of IN-ACT SIZE GAP REPORT -MDM -9 JUNE.xlsx` → PLANNING MASTER sheet (1515 ACT pairs).

---

## What's in the DB now

### Data
- `public.maj_cat_sizes` — 1,515 new rows where `attribute_name = 'SIZE'`
  - Columns used: `major_category` (e.g. `JB_TEES_FS`), `value` (e.g. `2-3Y`)
- `public.attribute_allowed_values` — 1 new row: size `105` for SIZE attribute (id=130)

### Functions (3)

| Function | Returns | Use |
|---|---|---|
| `public.is_size_allowed(major_category text, size text)` | boolean | Quick yes/no before save |
| `public.get_allowed_sizes(major_category text)` | setof text | Populate size dropdown |
| `public.validate_variant_sizes(major_category text, sizes text[])` | (size, is_allowed) | Bulk-check N sizes in 1 call |

All functions:
- Case-insensitive (UPPER+TRIM both sides)
- Whitespace-safe
- `STABLE` — Supabase caches per request
- Granted to `anon`, `authenticated`, `service_role`

---

## Frontend integration — 3 ways

### A. Supabase JS RPC (recommended for React/Next)

```ts
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Single check
const { data: ok } = await supabase.rpc('is_size_allowed', {
  p_major_category: 'JB_TEES_FS',
  p_size: 'XXXL',
})
if (!ok) throw new Error(`Size XXXL not allowed for JB_TEES_FS`)

// Dropdown
const { data: sizes } = await supabase.rpc('get_allowed_sizes', {
  p_major_category: 'JB_TEES_FS',
})

// Bulk variant check
const { data: results } = await supabase.rpc('validate_variant_sizes', {
  p_major_category: 'JB_TEES_FS',
  p_sizes: ['2-3Y', '4-5Y', 'XXXL', '32'],
})
// results = [{size_value:'2-3Y', is_allowed:true}, ..., {size_value:'XXXL', is_allowed:false}, ...]
const invalid = results.filter(r => !r.is_allowed).map(r => r.size_value)
if (invalid.length) throw new Error(`Not allowed: ${invalid.join(', ')}`)
```

### B. REST (PostgREST) — for backend Node/Python/etc

```bash
curl -X POST \
  "https://hgdftqswlvkspzjtlrll.supabase.co/rest/v1/rpc/is_size_allowed" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_major_category":"JB_TEES_FS","p_size":"XXXL"}'
# → false
```

### C. Backend Prisma raw query

```ts
const isOk = await prisma.$queryRaw<{is_size_allowed:boolean}[]>`
  SELECT public.is_size_allowed(${mc}, ${size}) AS is_size_allowed
`
```

---

## Where to wire it in the existing code

Repo: `uditmalik1998/Article-Creation/Backend/`

Recommended hooks:
1. **Variant creation endpoint** — before `INSERT extraction_results_flat` with `variant_size`, call `is_size_allowed(majorCategory, variantSize)`. Reject 422 if false.
2. **Frontend variant form** — replace static size dropdown with `get_allowed_sizes(majorCategory)` call. Disables invalid sizes at UI layer.
3. **Bulk upload (xlsx → variants)** — pass all sizes per MC to `validate_variant_sizes`, surface invalid rows in upload error report (parity with ZMM_ART1's IT_ERROR pattern in SAP).

Example Express middleware:
```ts
app.post('/variants', async (req, res) => {
  const { majorCategory, variantSize, ...rest } = req.body
  const { data: ok, error } = await supabase
    .rpc('is_size_allowed', { p_major_category: majorCategory, p_size: variantSize })
  if (error) return res.status(500).json({ error: error.message })
  if (!ok) return res.status(422).json({
    error: 'INVALID_SIZE_FOR_CATEGORY',
    detail: `Size '${variantSize}' is not allowed for category '${majorCategory}'.`,
  })
  // ...proceed with INSERT
})
```

---

## How to refresh data when planning master changes

1. Get fresh `PLANNING MASTER` sheet from latest IN-ACT SIZE GAP REPORT
2. Re-run the migration script (Phase 1 INSERT) — uses NOT EXISTS so it's idempotent. Adds new size×MC pairs, leaves existing rows alone.
3. To deactivate sizes that moved to IN-ACT: `DELETE FROM maj_cat_sizes WHERE attribute_name='SIZE' AND ...` — not yet automated; manual until xlsx-sync worker built.

---

## Smoke-test results (2026-06-09)

| Test | Expected | Got |
|---|---|---|
| `is_size_allowed('JB_TEES_FS','2-3Y')` | true | ✅ true |
| `is_size_allowed('JB_TEES_FS','XXXL')` | false | ✅ false |
| `is_size_allowed('M_TEES_FS','2-3Y')` (kid size on mens) | false | ✅ false |
| `is_size_allowed('m_tees_fs','s')` (case insensitive) | true | ✅ true |
| `is_size_allowed(' M_TEES_FS ','  S  ')` (whitespace) | true | ✅ true |
| `get_allowed_sizes('M_TEES_FS')` | S/M/L/XL/2XL/3XL | ✅ |
| `validate_variant_sizes('JB_TEES_FS', ['2-3Y','4-5Y','XXXL','32'])` | 2 valid, 2 invalid | ✅ |

---

## Open items (NOT blockers for going live today)

1. 🟡 **61 merchandise_code mismatches** between `categories.merchandise_code` and PLANNING MASTER `MC_CD`. Diff CSV at `C:\Users\akash.agarwal\.secrets\mc_code_diff.csv`. Reconcile with planning team. Doesn't affect this validation (text-keyed).
2. 🟡 **Duplicate SIZE master_attributes**: `key='size'` (id=154, no values) + `key='SIZE'` (id=130, 49 values). Merge later — both currently work because validation uses `maj_cat_sizes` not `attribute_allowed_values`.
3. 🔴 **RLS disabled on 30 tables**. Security blocker, separate sprint. Anyone with anon key has full read/write.
4. 🟢 **SAP push** — Phase 2 (ZART Z-tables + sync FM + ZMM_ART1 swap) deferred. App-side validation runs immediately without SAP changes.

---

## Files

- Data source: `C:\Users\akash.agarwal\Documents\Copy of IN-ACT SIZE GAP REPORT -MDM -9 JUNE.xlsx`
- Parsed JSON: `C:\Users\akash.agarwal\.secrets\planning-master.json`
- Migration SQL: `C:\Users\akash.agarwal\.secrets\insert_size_mc.sql`
- MC_CD diff: `C:\Users\akash.agarwal\.secrets\mc_code_diff.csv`
- DB creds: `C:\Users\akash.agarwal\.secrets\article-creation.env`
