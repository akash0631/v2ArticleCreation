# Article-Creation — Size×MC Validation Handover (Udit)

**Status:** Backend SoT + Supabase RPC + SAP mirror all LIVE on DEV+QA. Only frontend wire-up left. Then ship.
**Owner from here:** Udit Malik
**Repo:** github.com/uditmalik1998/Article-Creation
**ETA to publish:** ~2 hours work (1 RPC call + 1 dropdown swap + smoke + deploy).

---

## What's already done (don't redo)

### Supabase (Ai-auto-mdm, project `hgdftqswlvkspzjtlrll`, region ap-south-1)
- `public.maj_cat_sizes` — **1,515 rows** of ACT size×MC pairs (303 MCs, 42 sizes)
- 3 RPC functions live, granted to `anon/authenticated/service_role`:
  - `is_size_allowed(p_major_category text, p_size text) → boolean` — single check
  - `get_allowed_sizes(p_major_category text) → setof text` — dropdown source
  - `validate_variant_sizes(p_major_category text, p_sizes text[]) → (size_value, is_allowed)` — bulk
- Case-insensitive + whitespace-safe + `STABLE` (cached per request)

### SAP mirror (same SoT, both flows enforce same rules)
- Table `ZART_GRID_VALUES` active on S4D + S4Q (PROD push pending — Akash owns)
- FMs live: `Z_ART_GRID_IS_ALLOWED`, `Z_ART_GRID_UPSERT_BATCH`, `Z_ART_VALIDATE_VARIANT_SIZE`
- 1515 rows pushed QA, 6/6 smoke green
- ZMM_ART1 4-line CALL FUNCTION patch — Vaibhav owns (separate doc)

### Architecture decision
**App is SoT.** Planning team edits in Article-Creation app → daily/on-change worker syncs to SAP `ZART_GRID_VALUES` mirror. ZMM_ART1 BDC reads SAP mirror. Both manual BDC + app flow enforce same rules. **You own the app side. Akash owns the sync worker (next sprint).**

---

## What Udit needs to do (3 PRs)

### PR 1 — Block invalid sizes on variant save (backend)
File: `Backend/routes/variants.ts` (or wherever variant POST handler lives — search for `extraction_results_flat` INSERT)

Add **BEFORE** the INSERT:
```ts
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data: ok, error } = await supabase.rpc('is_size_allowed', {
  p_major_category: req.body.majorCategory,
  p_size: req.body.variantSize,
})
if (error) return res.status(500).json({ error: error.message })
if (!ok) return res.status(422).json({
  error: 'INVALID_SIZE_FOR_CATEGORY',
  detail: `Size '${req.body.variantSize}' not allowed for category '${req.body.majorCategory}'.`,
})
// proceed with existing INSERT
```

For bulk variant upload (xlsx flow), use `validate_variant_sizes` and return all invalid rows in one error response — parity with SAP IT_ERROR pattern.

### PR 2 — Filter size dropdown by selected MC (frontend)
File: variant form component (probably `Frontend/src/components/VariantForm.tsx` — search for the size `<Select>` / dropdown)

Replace static size list with:
```tsx
const [allowedSizes, setAllowedSizes] = useState<string[]>([])

useEffect(() => {
  if (!majorCategory) return
  supabase.rpc('get_allowed_sizes', { p_major_category: majorCategory })
    .then(({ data }) => setAllowedSizes(data?.map((r: any) => r.size_value) ?? []))
}, [majorCategory])

// in render:
<Select options={allowedSizes.map(s => ({ value: s, label: s }))} />
```

User picks MC → dropdown shows only valid sizes. PR1 enforces it server-side too.

### PR 3 — Bulk upload validation report (xlsx → variants)
File: bulk upload handler (Backend, search for xlsx parser + variant array)

```ts
const sizesByMc = groupBy(rows, 'majorCategory')
const allErrors: Array<{row:number, mc:string, size:string, reason:string}> = []
for (const [mc, mcRows] of Object.entries(sizesByMc)) {
  const sizes = mcRows.map(r => r.variantSize)
  const { data } = await supabase.rpc('validate_variant_sizes', {
    p_major_category: mc,
    p_sizes: sizes,
  })
  const invalid = new Set(data!.filter((d: any) => !d.is_allowed).map((d: any) => d.size_value))
  mcRows.forEach((r, i) => {
    if (invalid.has(r.variantSize)) {
      allErrors.push({row: r._rowNum, mc, size: r.variantSize, reason: 'SIZE_NOT_IN_MC'})
    }
  })
}
if (allErrors.length) return res.status(422).json({ errors: allErrors })
```

---

## Creds & URLs

Already in repo `.env`:
- `SUPABASE_URL=https://hgdftqswlvkspzjtlrll.supabase.co`
- `SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...` (use this on backend — needed because RLS off but future-proof)

If you don't have them: pull from `C:\Users\akash.agarwal\.secrets\article-creation.env` or ask Akash.

**Do NOT rotate keys.** Akash standing instruction.

---

## Smoke test (run before deploy)

### From your laptop:
```bash
# Should be true
curl -X POST "https://hgdftqswlvkspzjtlrll.supabase.co/rest/v1/rpc/is_size_allowed" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_major_category":"JB_TEES_FS","p_size":"2-3Y"}'

# Should be false (adult size on kids MC)
curl -X POST "https://hgdftqswlvkspzjtlrll.supabase.co/rest/v1/rpc/is_size_allowed" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_major_category":"JB_TEES_FS","p_size":"XXXL"}'

# Should return dropdown list
curl -X POST "https://hgdftqswlvkspzjtlrll.supabase.co/rest/v1/rpc/get_allowed_sizes" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_major_category":"M_TEES_FS"}'
```

### From the app (after PR1):
1. Pick MC `JB_TEES_FS`, size `XXXL` → save → expect 422 INVALID_SIZE_FOR_CATEGORY
2. Pick MC `JB_TEES_FS`, size `2-3Y` → save → expect 200 OK
3. Bulk upload xlsx with mixed valid/invalid → expect error list with invalid rows only

---

## Publish / Go-live steps

1. Open 3 PRs above on `Article-Creation` repo
2. Self-merge after green CI + smoke test
3. Deploy to whatever env you ship to (Vercel / Render / wherever)
4. Announce in #planning Slack/WhatsApp:
   - "Size validation live. Try saving a variant with an invalid size — it'll get blocked."
   - Link to a 2-line guide for planning team to edit `maj_cat_sizes` directly via Supabase Studio when sizes change
5. Akash builds daily sync worker (app → SAP) next sprint
6. Vaibhav drops 4-line CALL FUNCTION patch into ZMM_ART1 — same week

---

## Edge cases to handle

| Case | Behavior |
|---|---|
| New MC not yet in `maj_cat_sizes` | `get_allowed_sizes` returns empty → UI shows "No sizes configured for this MC. Contact planning." |
| Size with trailing whitespace from xlsx | RPC trims both sides — no false negatives |
| MC case mismatch (`m_tees_fs` vs `M_TEES_FS`) | UPPER on both sides — handled |
| Frontend bypass attempt | PR1 backend enforces → 422 still returned |

---

## Out of scope (Akash owns)

- Daily sync app→SAP mirror via Cloudflare worker cron (next sprint)
- STMS QA→PROD push for SAP table (~5 min when ready)
- ZMM_ART1 ABAP CALL FUNCTION patch (Vaibhav owns, doc at `~/.secrets/ZMM_ART1_INTEGRATION_FOR_VAIBHAV.md`)
- RLS enable on 30 Supabase tables (security sprint)
- 61 MC_CD diff resolution — already reconciled to SAP-canonical, csv at `~/.secrets/mc_code_diff.csv` if you want to verify
- Supabase MC dropdown source (categories table) cleanup — long-term

---

## Files you'll touch

- `Backend/routes/variants.ts` (or equivalent variant save handler)
- `Backend/routes/upload.ts` (bulk xlsx handler)
- `Frontend/src/components/VariantForm.tsx` (size dropdown)
- (optional) `Backend/lib/supabase.ts` — shared client init

## Files you won't touch but should know exist

- `~/.secrets/planning-master.json` — 1515 rows source data
- `~/.secrets/insert_size_mc.sql` — idempotent re-seed script
- `~/.secrets/mc_code_diff.csv` — 61 MC reconciliation diff
- `v2retail/zart-grid-size-sot.md` (Akash's Obsidian) — full SAP architecture

---

## If you hit any issues

Ping Akash. Common gotchas:
- RPC returns null → check param names are `p_major_category` not `majorCategory` (Supabase strict on PostgreSQL function arg names)
- 401 → service role key needed on backend, not anon
- Dropdown empty → MC code mismatch — check `maj_cat_sizes` for that MC
- Sync worker not built yet → planning edits in Supabase only update app, not SAP until cron lands

---

**Bottom line:** RPCs work, data is loaded, smoke is green. 3 small PRs + deploy = live. Ship it.
