# Members Period Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `members` rows a period, so the Performance page's period picker actually filters the Members-by-Deposit/GGR tables, and Dashboard's From/To range filters member counts/Top 50 too.

**Architecture:** Add `period`/`period_type` columns to `members` (mirroring `performance_data`'s existing convention) and change its upsert key from `(username, partner)` to `(username, partner, period)` so each import adds a new period-scoped row instead of overwriting. `GET /api/members` gains period/from-to filtering with a per-partner "latest period" fallback for views that don't specify one. Members import UI gains the same Monthly/Daily period picker the SSS Data importer already has.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + supabase-js), TypeScript strict mode, no test framework (manual/script-based verification per project convention).

## Global Constraints

- No test suite exists in this repo — verification is via `npx tsc --noEmit` per backend/frontend task, a final `npm run build`, and manual browser walkthroughs. This matches the project's established convention (see `docs/superpowers/specs/2026-06-23-sss-data-date-range-filter-design.md`'s Testing section).
- Any throwaway `.mjs` verification script touching the live Supabase DB must use `node --env-file=.env.local`, the service role key, and be deleted immediately after use — no scripts folder, no admin endpoints (see project convention).
- Any DB row inserted purely for verification must use an obviously-fake `partner`/`username` (e.g. `__migration_test_partner__`) and be deleted before and after the check runs, so a script left running mid-way never pollutes real data.
- SSS Data page (`app/(app)/sss-data/SSSDataClient.tsx`) is explicitly out of scope — no changes.
- No period selector is added to the Members page or Dashboard UI — both keep showing the latest snapshot with no visible change when no period/range is selected.
- The 1,390 existing `members` rows keep `period = NULL` permanently — no backfill.

---

### Task 1: Database migration — add period columns and change the unique constraint

**Files:**
- None in the repo (the `members` table is not tracked in `supabase/schema.sql` — it was created directly in Supabase). This task runs SQL directly against the live database.
- Verify: throwaway `_tmp_verify_members_migration.mjs` in the project root, deleted after use.

**Interfaces:**
- Produces: `members.period VARCHAR(20)` (nullable), `members.period_type VARCHAR(10)` (nullable), and a unique constraint on `(username, partner, period)` replacing the old `(username, partner)` one. Tasks 2 and 3 depend on both existing.

- [ ] **Step 1: Ask Claire to run the migration SQL in the Supabase SQL Editor**

This step cannot be automated — there is no DDL-execution path available via the app's service-role REST credentials (confirmed: no `exec_sql` RPC exists, and PostgREST doesn't expose `information_schema` for arbitrary queries). Ask Claire to paste and run this in the Supabase Dashboard's SQL Editor, then confirm back that it ran without error:

```sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS period VARCHAR(20);
ALTER TABLE members ADD COLUMN IF NOT EXISTS period_type VARCHAR(10);

DO $$
DECLARE
  cname text;
BEGIN
  SELECT tc.constraint_name INTO cname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'members'
    AND tc.constraint_type = 'UNIQUE'
  GROUP BY tc.constraint_name
  HAVING array_agg(kcu.column_name ORDER BY kcu.column_name) = ARRAY['partner', 'username'];

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE members DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE members ADD CONSTRAINT members_username_partner_period_key
  UNIQUE (username, partner, period);
```

- [ ] **Step 2: Write and run a verification script**

Create `_tmp_verify_members_migration.mjs` in the project root:

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_PARTNER = '__migration_test_partner__';
const TEST_USER = '__migration_test_user__';

async function cleanup() {
  await supabase.from('members').delete().eq('partner', TEST_PARTNER);
}

await cleanup();

const { error: insertErr1 } = await supabase.from('members').insert({
  partner: TEST_PARTNER, sub_affiliate: 'test', sub_affiliate_name: 'Test',
  username: TEST_USER, period: '2026-07-01', period_type: 'daily', deposit: 100, withdraw: 0,
});
const { error: insertErr2 } = await supabase.from('members').insert({
  partner: TEST_PARTNER, sub_affiliate: 'test', sub_affiliate_name: 'Test',
  username: TEST_USER, period: '2026-07-02', period_type: 'daily', deposit: 200, withdraw: 0,
});
console.log('insert period 2026-07-01 error (expect null):', insertErr1);
console.log('insert period 2026-07-02 error (expect null):', insertErr2);

const { data: rows } = await supabase.from('members').select('username, period, deposit').eq('partner', TEST_PARTNER);
console.log('rows after two different periods (expect 2 rows):', rows);

const { error: dupErr } = await supabase.from('members').insert({
  partner: TEST_PARTNER, sub_affiliate: 'test', sub_affiliate_name: 'Test',
  username: TEST_USER, period: '2026-07-01', period_type: 'daily', deposit: 999, withdraw: 0,
});
console.log('duplicate (username, partner, period) insert error (expect a unique-violation error, code 23505):', dupErr);

await cleanup();
console.log('cleanup done');
```

Run: `node --env-file=.env.local _tmp_verify_members_migration.mjs`

Expected output: both single-period inserts show `error: null`, the two-row select returns exactly 2 rows (`2026-07-01`/deposit 100 and `2026-07-02`/deposit 200), and the duplicate insert shows a non-null error with `code: '23505'` (unique violation).

- [ ] **Step 3: Delete the verification script**

```bash
rm _tmp_verify_members_migration.mjs
```

- [ ] **Step 4: Confirm with Claire and move on**

No commit for this task — it's a live DB change, not a repo change.

---

### Task 2: `POST /api/members` — accept and stamp period, update conflict key, fix the registered-time lock

**Files:**
- Modify: `app/api/members/route.ts:77-123` (the `POST` handler)

**Interfaces:**
- Consumes: `members.period`/`members.period_type` columns and the `(username, partner, period)` unique constraint from Task 1.
- Produces: `POST /api/members` now requires `{ records, period, period_type }` in the body (previously just `{ records }`). Task 4's frontend change is the caller that supplies these new fields.

- [ ] **Step 1: Replace the `POST` handler**

In `app/api/members/route.ts`, replace lines 77-123 (the entire `export async function POST` block) with:

```ts
export async function POST(request: NextRequest) {
  try {
    const { records, period, period_type } = await request.json()
    if (!records || records.length === 0) {
      return NextResponse.json({ error: 'No records provided.' }, { status: 400 })
    }
    if (!period) {
      return NextResponse.json({ error: 'Period is required.' }, { status: 400 })
    }

    const partnerVal: string = records[0]?.partner || ''

    // Fetch existing rows across ALL periods for this partner, so the lock-to-first-upload
    // logic below can find each username's true earliest record, not just the last one fetched.
    const existingRows = await fetchAllMembers(
      partnerVal,
      'username, registered_time, first_deposit_amount, period'
    )
    const existingMap: Record<string, any> = {}
    for (const e of existingRows) {
      const current = existingMap[e.username]
      if (!current) { existingMap[e.username] = e; continue }
      const eTime = e.registered_time ? new Date(e.registered_time).getTime() : null
      const curTime = current.registered_time ? new Date(current.registered_time).getTime() : null
      if (eTime !== null && (curTime === null || eTime < curTime)) {
        existingMap[e.username] = e
      } else if (eTime === null && curTime === null) {
        const eP: string | null = e.period ?? null
        const curP: string | null = current.period ?? null
        if (eP !== null && (curP === null || eP < curP)) existingMap[e.username] = e
      }
    }

    // Replace all fields with the new upload's values, except registered_time/first_deposit_amount
    // which stay locked to the earliest-ever record for that username, and stamp period/period_type.
    const mergedRecords = records.map((r: any) => {
      const ex = existingMap[r.username]
      const base = ex
        ? {
            ...r,
            registered_time: ex.registered_time || r.registered_time,
            first_deposit_amount: ex.first_deposit_amount || r.first_deposit_amount,
          }
        : r
      return { ...base, period, period_type: period_type || null }
    })

    // Upsert merged records in batches of 500
    const BATCH = 500
    let upserted = 0
    for (let i = 0; i < mergedRecords.length; i += BATCH) {
      const batch = mergedRecords.slice(i, i + BATCH)
      const { error } = await supabase
        .from('members')
        .upsert(batch, { onConflict: 'username,partner,period' })
      if (error) throw error
      upserted += batch.length
    }

    return NextResponse.json({ count: upserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/api/members/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/members/route.ts
git commit -m "feat: stamp period on member uploads, fix registered_time lock across periods"
```

---

### Task 3: `GET /api/members` — period/from-to filtering with per-partner latest fallback

**Files:**
- Modify: `app/api/members/route.ts:1-75` (the `fetchAllMembers` helper and the `GET` handler)

**Interfaces:**
- Consumes: same schema as Task 1/2.
- Produces: `GET /api/members` accepts `period=<exact>`, or `from=<x>&to=<y>`, in addition to the existing `partner`, `top`, `full`, `summary` params. When none of `period`/`from`/`to` are given, results resolve to each represented partner's own latest period (or that partner's `period IS NULL` rows if it has no period-tagged data yet). Task 5 (Dashboard) and Task 6 (Performance page) are the callers that supply `period`/`from`/`to`.

- [ ] **Step 1: Replace `fetchAllMembers` and add the period-filter/fallback helpers**

In `app/api/members/route.ts`, replace lines 1-24 (the imports through the end of `fetchAllMembers`) with:

```ts
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_COLUMNS = 'username, sub_affiliate, sub_affiliate_name, dsp, status, registered_time, member_rank, last_login_time, first_deposit_amount, deposit, deposit_times, withdraw, withdraw_times'

type PeriodFilter =
  | { kind: 'exact'; period: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'null_only' }
  | { kind: 'none' }

function applyPeriodFilter(query: any, filter?: PeriodFilter) {
  if (!filter || filter.kind === 'none') return query
  if (filter.kind === 'exact') return query.eq('period', filter.period)
  if (filter.kind === 'range') return query.gte('period', filter.from).lte('period', filter.to)
  if (filter.kind === 'null_only') return query.is('period', null)
  return query
}

async function fetchAllMembers(partner?: string | null, columns = DEFAULT_COLUMNS, periodFilter?: PeriodFilter) {
  let query = supabase
    .from('members')
    .select(columns)
    .order('sub_affiliate', { ascending: true })
    .order('registered_time', { ascending: true })
  if (partner) query = query.eq('partner', partner)
  query = applyPeriodFilter(query, periodFilter)

  const allRows: any[] = []
  let start = 0
  const PAGE = 1000
  while (true) {
    const { data: page, error } = await query.range(start, start + PAGE - 1)
    if (error) throw error
    if (!page || page.length === 0) break
    allRows.push(...page)
    if (page.length < PAGE) break
    start += PAGE
  }
  return allRows
}

async function resolveLatestPeriodForPartner(partnerVal: string | null) {
  let q = supabase.from('members').select('period').not('period', 'is', null).order('period', { ascending: false }).limit(1)
  if (partnerVal) q = q.eq('partner', partnerVal)
  const { data } = await q
  return data && data.length > 0 ? (data[0] as any).period as string : null
}

async function fetchAllMembersLatestFallback(partner: string | null, columns: string) {
  if (partner) {
    const latest = await resolveLatestPeriodForPartner(partner)
    const filter: PeriodFilter = latest ? { kind: 'exact', period: latest } : { kind: 'null_only' }
    return fetchAllMembers(partner, columns, filter)
  }
  const { data: partnersData } = await supabase.from('members').select('partner').not('partner', 'is', null)
  const partners = Array.from(new Set((partnersData || []).map((r: any) => r.partner as string)))
  if (partners.length === 0) {
    return fetchAllMembers(null, columns, { kind: 'none' })
  }
  const results = await Promise.all(partners.map(async (p) => {
    const latest = await resolveLatestPeriodForPartner(p)
    const filter: PeriodFilter = latest ? { kind: 'exact', period: latest } : { kind: 'null_only' }
    return fetchAllMembers(p, columns, filter)
  }))
  return results.flat()
}
```

- [ ] **Step 2: Update the `GET` handler to use period/from/to**

Replace the `GET` handler (originally lines 37-75, now shifted down by the Step 1 insertion — locate it by its `export async function GET` signature) with:

```ts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const partner = searchParams.get('partner')
    const period = searchParams.get('period')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const top = searchParams.get('top')       // 'deposit' | 'ggr'
    const full = searchParams.get('full') === 'true'
    const summaryOnly = searchParams.get('summary') === 'true'

    let allRows: any[]
    if (period && period !== 'all') {
      allRows = await fetchAllMembers(partner, DEFAULT_COLUMNS, { kind: 'exact', period })
    } else if (from && to) {
      allRows = await fetchAllMembers(partner, DEFAULT_COLUMNS, { kind: 'range', from, to })
    } else {
      allRows = await fetchAllMembersLatestFallback(partner, DEFAULT_COLUMNS)
    }

    // Lightweight summary-only mode (for Dashboard)
    if (summaryOnly) {
      return NextResponse.json({ summary: buildSummary(allRows) })
    }

    // Top-50 mode (Dashboard); pass full=true for the complete sorted list, zero values excluded (Performance page)
    if (top === 'deposit') {
      let sorted = [...allRows].sort((a, b) => (b.deposit || 0) - (a.deposit || 0))
      if (full) sorted = sorted.filter(r => (r.deposit || 0) !== 0)
      else sorted = sorted.slice(0, 50)
      return NextResponse.json({ members: sorted })
    }
    if (top === 'ggr') {
      let sorted = [...allRows]
        .map(r => ({ ...r, ggr: (r.deposit || 0) - (r.withdraw || 0) }))
        .sort((a, b) => b.ggr - a.ggr)
      if (full) sorted = sorted.filter(r => r.ggr !== 0)
      else sorted = sorted.slice(0, 50)
      return NextResponse.json({ members: sorted })
    }

    return NextResponse.json({
      members: allRows,
      summary: buildSummary(allRows),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

`buildSummary` (originally lines 26-35) and the `POST` handler stay where they are, unchanged by this task.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/api/members/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/api/members/route.ts
git commit -m "feat: filter GET /api/members by period/from-to with per-partner latest fallback"
```

---

### Task 4: Members import UI — collect a period before upload

**Files:**
- Modify: `app/(app)/members/MembersClient.tsx`

**Interfaces:**
- Consumes: `POST /api/members` now requiring `{ records, period, period_type }` (Task 2).
- Produces: nothing new consumed by later tasks — this is a leaf UI change.

- [ ] **Step 1: Add period state and a `getPeriod` helper**

In `app/(app)/members/MembersClient.tsx`, after line 49 (`const fileRef = useRef<HTMLInputElement>(null)`), add:

```ts
  const [periodType, setPeriodType] = useState<'monthly' | 'daily'>('monthly')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [date, setDate] = useState('')

  const getPeriod = () => {
    if (periodType === 'monthly') return `${year}-${month.padStart(2, '0')}`
    return date
  }
```

- [ ] **Step 2: Validate the period and send it in the upload body**

Replace `handleUpload` (lines 79-120) with:

```ts
  const handleUpload = async () => {
    if (!parsed.length) return
    if (periodType === 'monthly' && !month) { setError('Please select a month before uploading.'); return }
    if (periodType === 'daily' && !date) { setError('Please select a date before uploading.'); return }
    const period = getPeriod()
    setUploading(true)
    setError(null)
    try {
      const records = parsed.map((row: any) => ({
        partner: row['Partner'] || partner,
        sub_affiliate: row['Sub Affiliate'],
        sub_affiliate_name: row['Sub Affiliate Name'],
        channel: row['Channel'] || null,
        ad_name: row['AD Name'] || null,
        username: row['Username'],
        dsp: row['DSP'] || row['Dsp'] || null,
        registered_time: row['Registered Time'] ? new Date(row['Registered Time']).toISOString() : null,
        status: row['Status'] || null,
        member_rank: row['Member Rank'] || null,
        last_login_time: row['Last Login Time'] ? new Date(row['Last Login Time']).toISOString() : null,
        first_deposit_amount: parseFloat(row['First Deposit Amount']) || 0,
        deposit: parseFloat(row['Deposit']) || 0,
        deposit_times: parseInt(row['Deposit Times']) || 0,
        withdraw: parseFloat(row['Withdraw']) || 0,
        withdraw_times: parseInt(row['Withdraw Times']) || 0,
      })).filter(r => r.username && r.sub_affiliate)

      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records, period, period_type: periodType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed.')
      setResult(`✅ ${data.count} member records uploaded for period ${period}.`)
      setParsed([])
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      fetchMembers()
    } catch (err: any) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }
```

- [ ] **Step 3: Add the period picker UI to the "file selected" banner**

Replace the banner block (lines 153-163) with:

```tsx
      {file && parsed.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 dark:bg-blue-900/20 dark:border-blue-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">{file.name} — {parsed.length} rows ready</p>
            <div className="flex gap-2">
              <button onClick={() => { setFile(null); setParsed([]); if (fileRef.current) fileRef.current.value = '' }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded dark:text-gray-400">Cancel</button>
              <button onClick={handleUpload} disabled={uploading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setPeriodType('monthly')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${periodType === 'monthly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>Monthly</button>
            <button onClick={() => setPeriodType('daily')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${periodType === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>Daily</button>
            {periodType === 'monthly' ? (
              <>
                <select value={month} onChange={(e) => setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                  <option value="">Month</option>
                  {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) => (
                    <option key={m} value={m}>{['January','February','March','April','May','June','July','August','September','October','November','December'][i]}</option>
                  ))}
                </select>
                <select value={year} onChange={(e) => setYear(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                  {['2024','2025','2026','2027'].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </>
            ) : (
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/(app)/members/MembersClient.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/members/MembersClient.tsx"
git commit -m "feat: collect a period before uploading members"
```

---

### Task 5: Dashboard — apply From/To to member calls

**Files:**
- Modify: `app/(app)/dashboard/page.tsx:39-47`

**Interfaces:**
- Consumes: `GET /api/members` now accepting `from`/`to` (Task 3).

- [ ] **Step 1: Append the existing `base` range string to the two member fetch calls**

Replace lines 39-47 of `app/(app)/dashboard/page.tsx`:

```ts
  const fetchAll = async (f: string, t: string) => {
    setLoading(true)
    try {
      const base = f && t ? `&from=${f}&to=${t}` : ''
      const [perfResults, memberResults, top50Res] = await Promise.all([
        Promise.all(PARTNERS.map(p => fetch(`/api/performance?partner=${encodeURIComponent(p.key)}${base}`).then(r => r.json()))),
        Promise.all(PARTNERS.map(p => fetch(`/api/members?partner=${encodeURIComponent(p.key)}&summary=true${base}`).then(r => r.json()))),
        fetch(`/api/members?top=deposit${base}`).then(r => r.json()),
      ])
```

(Only the two `/api/members` lines change — `&summary=true${base}` and `top=deposit${base}` replace `&summary=true` and `top=deposit`.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/(app)/dashboard/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat: apply Dashboard's From/To range to member counts and Top 50"
```

---

### Task 6: Performance page — apply the period picker to Member tables

**Files:**
- Modify: `app/(app)/performance/PerformancePage.tsx:250-257`

**Interfaces:**
- Consumes: `GET /api/members` now accepting `period` (Task 3).

- [ ] **Step 1: Add a period param to the two member fetch calls**

Replace lines 250-257 of `app/(app)/performance/PerformancePage.tsx`:

```ts
  const fetchData = async (period: string) => {
    setLoading(true)
    const partnerParam = partner ? `&partner=${encodeURIComponent(partner)}` : ''
    const periodParam = period && period !== 'all' ? `&period=${encodeURIComponent(period)}` : ''
    const [perfRes, memDepRes, memGGRRes] = await Promise.all([
      fetch(buildUrl(period)),
      fetch(`/api/members?top=deposit&full=true${partnerParam}${periodParam}`),
      fetch(`/api/members?top=ggr&full=true${partnerParam}${periodParam}`),
    ])
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/(app)/performance/PerformancePage.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/performance/PerformancePage.tsx"
git commit -m "feat: filter Performance page Member tables by the selected period"
```

---

### Task 7: Full build check and end-to-end browser verification

**Files:** none (verification only).

**Interfaces:** none — this is the integration checkpoint for all of Tasks 1-6.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: builds successfully with no TypeScript or lint errors.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`

- [ ] **Step 3: Upload two Members CSVs for two different periods**

In the browser, sign in, go to Members for one partner (e.g. Alpharus), and import a small CSV twice: once selecting Daily with one date (e.g. today), once selecting Daily with a different date (e.g. yesterday), reusing at least one overlapping username between the two uploads. Confirm both uploads succeed and the Members page (no period selector) shows the latest of the two uploads' values for the overlapping username, with its `Registered` column unchanged between the two uploads (confirming the registered_time lock held across periods).

- [ ] **Step 4: Confirm the Performance page's Members tables now track the period picker**

Go to Performance for the same partner. Select the period matching the first Members upload's date — confirm the Members-by-Deposit/GGR tables show that upload's numbers. Switch to the second period — confirm the numbers change to match the second upload. Select a period with no member upload (e.g. an older `performance_data`-only period) — confirm the Members tables show empty/zero rather than stale data.

- [ ] **Step 5: Confirm the Dashboard's From/To now affects member counts and Top 50**

Go to Dashboard. Set From and To to a range covering only the first upload's date — confirm member counts and Top 50 reflect that upload. Widen the range to cover both uploads — confirm the union appears. Clear both fields — confirm it reverts to each partner's latest-period totals (the latest-fallback behavior from Task 3).

- [ ] **Step 6: Confirm legacy rows are unaffected**

For a partner/username that was never re-uploaded under the new flow, confirm it still appears when Dashboard/Members page show "latest" with no period filter (the `period IS NULL` fallback), and does not appear when a specific period or date range is selected on the Performance page or Dashboard.

- [ ] **Step 7: Final commit if any fixups were needed during verification**

If Steps 3-6 surfaced any small issues, fix them in the relevant file from Tasks 2-6, re-run `npx tsc --noEmit`, and commit:

```bash
git add -A
git commit -m "fix: address issues found in end-to-end members period verification"
```

If no issues were found, no commit is needed for this task.
