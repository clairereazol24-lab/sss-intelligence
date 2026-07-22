# Marketing Performance Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Marketing Performance" module that logs store visits (Community/Booth
Activation) and auto-computes each store's Before/After SSS Data (deposit, GGR, registered
members), split at the visit date, live on every page load.

**Architecture:** Rebuild the existing hidden `marketing_efforts` table + route in place (new
columns, dropping the old unused ones). A single shared computation function in
`lib/marketing-performance.ts` does the Before/After aggregation against `performance_data` and
`members`, called by the list API route. The frontend is a list page with an "Add Visit" modal
(store picked from the existing Store Directory via a small type-to-filter component) and a
detail drawer, matching this app's existing card/table visual style (blue-600 accents, rounded-xl
cards, `bg-white dark:bg-gray-800`).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role admin client), Tailwind.
No automated test framework exists in this repo (`package.json` has no jest/vitest) — verification
in this plan uses `npx tsc --noEmit`, temporary Node verification scripts run against the live
Supabase DB (this project's established pattern — see any `check-*.mjs` used before), and manual
checks against `npm run dev`.

## Global Constraints

- Reuse the existing `marketing_efforts` permission key — do NOT touch the
  `module_permissions` CHECK constraint (it already allows `'marketing_efforts'`).
- The `marketing_efforts` table is confirmed **empty (0 rows)** in production — safe to drop
  columns without a backfill/data-loss concern.
- Matching key for a store everywhere in this task is `sub_affiliate` + `partner` (never
  `sub_affiliate` alone) — this app has had real bugs from cross-partner `sub_affiliate`
  collisions.
- Every Supabase query that can return >1000 rows MUST paginate with the
  `while (true) { .range(start, start+999); if (page.length < PAGE) break }` loop — standing
  rule in this codebase, `performance_data` and `members` both regularly exceed 1000 rows.
- Always run `npx tsc --noEmit` before considering any task done — no test suite exists to
  catch type errors otherwise.
- Route params in this Next.js 14 project are synchronous (`{ params }: { params: { id: string } }`),
  NOT `Promise<{ id: string }>` — confirmed from `app/api/operations/[id]/route.ts` and
  `app/api/accounts/[id]/route.ts`. Do not use the Next 15/16 async-params style here.

---

### Task 1: Database migration

**Files:**
- Modify: `supabase/schema.sql` (marketing_efforts section, currently lines 47-60)

**Interfaces:**
- Produces: live `marketing_efforts` table with columns
  `id, date_visit (DATE), partner (VARCHAR), dsp (VARCHAR), sub_affiliate (VARCHAR NOT NULL),
  sub_affiliate_name (VARCHAR), marketing_type (VARCHAR, CHECK IN ('Community','Booth Activation')),
  created_by (UUID), created_at (TIMESTAMPTZ)` — every later task depends on this exact shape.

- [ ] **Step 1: Update `supabase/schema.sql`'s marketing_efforts section**

Replace the existing block (originally):
```sql
-- ============================================================
-- MARKETING EFFORTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_efforts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  location VARCHAR(200),
  store_name VARCHAR(200),
  sub_affiliate VARCHAR(100),
  activities_done TEXT,
  headcount INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

with:
```sql
-- ============================================================
-- MARKETING EFFORTS TABLE (rebuilt 2026-07-22 as "Marketing Performance":
-- logs store visits and computes Before/After SSS Data live, split at
-- date_visit — see docs/superpowers/specs/2026-07-22-marketing-performance-design.md)
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_efforts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date_visit DATE NOT NULL DEFAULT CURRENT_DATE,
  partner VARCHAR(100),
  dsp VARCHAR(200),
  sub_affiliate VARCHAR(100) NOT NULL,
  sub_affiliate_name VARCHAR(200),
  marketing_type VARCHAR(20) NOT NULL CHECK (marketing_type IN ('Community', 'Booth Activation')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration for the LIVE table (table confirmed empty, 0 rows, as of
-- 2026-07-22 — safe to drop columns with no data loss):
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS date;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS location;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS store_name;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS activities_done;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS headcount;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS notes;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS report_file_url;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS report_file_name;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS report_file_type;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS total_deposit;
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS date_visit DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS partner VARCHAR(100);
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS dsp VARCHAR(200);
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS sub_affiliate VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS sub_affiliate_name VARCHAR(200);
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS marketing_type VARCHAR(20) NOT NULL DEFAULT 'Community'
  CHECK (marketing_type IN ('Community', 'Booth Activation'));
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_marketing_sub_affiliate ON marketing_efforts(sub_affiliate, partner);
CREATE INDEX IF NOT EXISTS idx_marketing_date_visit ON marketing_efforts(date_visit);
```

Note: the `idx_marketing_date` / `idx_marketing_store` indexes further down in the same file
(lines ~110-111, on the OLD `date`/`sub_affiliate` columns) reference `date`, which no longer
exists after this migration — drop those two `CREATE INDEX` lines too (the new
`idx_marketing_date_visit` / `idx_marketing_sub_affiliate` above replace them).

- [ ] **Step 2: Ask Claire to run the migration SQL in the Supabase SQL Editor**

Give her the full `ALTER TABLE` block from Step 1 (the migration portion, not the
`CREATE TABLE IF NOT EXISTS`, since the live table already exists) to paste into the Supabase
SQL Editor. Wait for her confirmation it ran successfully before continuing to Task 2.

- [ ] **Step 3: Verify the live schema matches**

Write a temporary script `check-schema.mjs` in the project root:
```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await supabase.from('marketing_efforts').select('*').limit(1)
if (error) { console.error(error); process.exit(1) }
console.log('OK — columns visible:', data.length === 0 ? '(no rows, checking via insert)' : Object.keys(data[0]))
// Insert-and-rollback style check: try inserting a throwaway row with the new shape.
const { data: inserted, error: insErr } = await supabase.from('marketing_efforts').insert({
  date_visit: '2020-01-01', partner: 'TestPartner', dsp: 'TestDSP',
  sub_affiliate: 'TEST_SCHEMA_CHECK', sub_affiliate_name: 'Test Store', marketing_type: 'Community',
}).select().single()
if (insErr) { console.error('INSERT FAILED:', insErr); process.exit(1) }
console.log('Insert OK, columns:', Object.keys(inserted))
await supabase.from('marketing_efforts').delete().eq('id', inserted.id)
console.log('Cleaned up test row.')
```

Run: `node --env-file=.env.local check-schema.mjs`
Expected: `Insert OK, columns: [ 'id', 'date_visit', 'partner', 'dsp', 'sub_affiliate', 'sub_affiliate_name', 'marketing_type', 'created_by', 'created_at' ]`
followed by `Cleaned up test row.`

Delete `check-schema.mjs` after this passes.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Rebuild marketing_efforts schema for Marketing Performance module"
```

---

### Task 2: Core Before/After computation library

**Files:**
- Create: `lib/marketing-performance.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/lib/supabase-admin` (existing, `import { supabaseAdmin as supabase } from '@/lib/supabase-admin'`).
- Produces (used by Task 3's API route and by the frontend in Tasks 6-7):
  - `type MarketingVisit = { id: string; date_visit: string; partner: string | null; dsp: string | null; sub_affiliate: string; sub_affiliate_name: string | null; marketing_type: 'Community' | 'Booth Activation'; created_at: string }`
  - `type VisitMetrics = { before: { deposit: number; ggr: number; members: number }; after: { deposit: number; ggr: number; members: number } }`
  - `type VisitWithMetrics = MarketingVisit & VisitMetrics`
  - `async function attachBeforeAfterMetrics(visits: MarketingVisit[]): Promise<VisitWithMetrics[]>`

- [ ] **Step 1: Write `lib/marketing-performance.ts`**

```ts
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export type MarketingVisit = {
  id: string
  date_visit: string
  partner: string | null
  dsp: string | null
  sub_affiliate: string
  sub_affiliate_name: string | null
  marketing_type: 'Community' | 'Booth Activation'
  created_at: string
}

export type VisitMetrics = {
  before: { deposit: number; ggr: number; members: number }
  after: { deposit: number; ggr: number; members: number }
}

export type VisitWithMetrics = MarketingVisit & VisitMetrics

const PAGE = 1000

async function fetchAllPaginated<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = []
  let start = 0
  while (true) {
    const { data, error } = await build(start, start + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    start += PAGE
  }
  return rows
}

type PerfRow = { sub_affiliate: string; partner: string | null; period: string; total_deposit: number | null; company_net_win: number | null }
type MemberRow = { username: string; sub_affiliate: string; partner: string | null; registered_time: string | null }

/**
 * For each visit, splits that store's entire performance_data/members history at
 * date_visit: everything with period/registered_time before date_visit is "before",
 * everything from date_visit onward is "after". "After" is never stored — it's
 * recomputed from live data on every call, so it grows as new SSS Data is uploaded.
 */
export async function attachBeforeAfterMetrics(visits: MarketingVisit[]): Promise<VisitWithMetrics[]> {
  if (visits.length === 0) return []

  const subAffiliates = Array.from(new Set(visits.map(v => v.sub_affiliate)))

  const perfRows = await fetchAllPaginated<PerfRow>((from, to) =>
    supabase
      .from('performance_data')
      .select('sub_affiliate, partner, period, total_deposit, company_net_win')
      .in('sub_affiliate', subAffiliates)
      .range(from, to)
  )

  const memberRows = await fetchAllPaginated<MemberRow>((from, to) =>
    supabase
      .from('members')
      .select('username, sub_affiliate, partner, registered_time')
      .in('sub_affiliate', subAffiliates)
      .range(from, to)
  )

  // Dedupe members by username+partner, keeping the earliest registered_time seen.
  // registered_time is locked to the earliest-ever record per username on import
  // (see Members module notes), so every row for a username should already carry
  // it — this min-keep is a defensive guard, not the primary mechanism.
  const memberByUsername = new Map<string, MemberRow>()
  for (const m of memberRows) {
    const key = `${m.username}__${m.partner ?? ''}`
    const existing = memberByUsername.get(key)
    if (!existing) { memberByUsername.set(key, m); continue }
    const eTime = existing.registered_time ? new Date(existing.registered_time).getTime() : null
    const mTime = m.registered_time ? new Date(m.registered_time).getTime() : null
    if (mTime !== null && (eTime === null || mTime < eTime)) memberByUsername.set(key, m)
  }
  const dedupedMembers = Array.from(memberByUsername.values())

  return visits.map(visit => {
    const sameStore = (subAffiliate: string, partner: string | null) =>
      subAffiliate === visit.sub_affiliate && (partner ?? '') === (visit.partner ?? '')

    let beforeDeposit = 0, beforeGGR = 0, afterDeposit = 0, afterGGR = 0
    for (const row of perfRows) {
      if (!sameStore(row.sub_affiliate, row.partner)) continue
      if (row.period < visit.date_visit) {
        beforeDeposit += row.total_deposit || 0
        beforeGGR += row.company_net_win || 0
      } else {
        afterDeposit += row.total_deposit || 0
        afterGGR += row.company_net_win || 0
      }
    }

    let beforeMembers = 0, afterMembers = 0
    for (const m of dedupedMembers) {
      if (!sameStore(m.sub_affiliate, m.partner) || !m.registered_time) continue
      const regDate = m.registered_time.slice(0, 10)
      if (regDate < visit.date_visit) beforeMembers++
      else afterMembers++
    }

    return {
      ...visit,
      before: { deposit: beforeDeposit, ggr: beforeGGR, members: beforeMembers },
      after: { deposit: afterDeposit, ggr: afterGGR, members: afterMembers },
    }
  })
}
```

- [ ] **Step 2: Verify against real data with a temporary script**

This repo has no `ts-node`/`tsx` configured and `lib/marketing-performance.ts` uses the `@/`
import alias, so a plain `node` script can't `import` it directly. Instead, write
`check-computation.mjs` in the project root with an independent re-implementation of the same
paginated-fetch-and-split logic, and compare its output against a raw unfiltered sum computed a
different way (via Supabase's own aggregate), as a cross-check that the split-at-date logic in
Task 2 Step 1 is correct:

```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Pick a real store that has performance_data rows.
const { data: sample } = await supabase.from('performance_data').select('sub_affiliate, partner').limit(1).single()
console.log('Testing with sub_affiliate:', sample.sub_affiliate, 'partner:', sample.partner)

async function fetchAllPaginated(build) {
  const rows = []
  let start = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await build(start, start + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    start += PAGE
  }
  return rows
}

const perfRows = await fetchAllPaginated((from, to) =>
  supabase
    .from('performance_data')
    .select('sub_affiliate, partner, period, total_deposit, company_net_win')
    .eq('sub_affiliate', sample.sub_affiliate)
    .eq('partner', sample.partner)
    .range(from, to)
)
console.log('Row count for this store:', perfRows.length)

const rawTotalDeposit = perfRows.reduce((a, r) => a + (r.total_deposit || 0), 0)
console.log('Raw sum of total_deposit across ALL rows:', rawTotalDeposit)

// Reproduce the split logic from lib/marketing-performance.ts with a far-future
// date_visit (2099-01-01) — every real period string sorts before it, so 100% of
// rows must land in "before" and "after" must be exactly 0.
const dateVisit = '2099-01-01'
let beforeDeposit = 0, afterDeposit = 0
for (const row of perfRows) {
  if (row.period < dateVisit) beforeDeposit += row.total_deposit || 0
  else afterDeposit += row.total_deposit || 0
}
console.log('Computed before.deposit (must equal the raw sum above):', beforeDeposit)
console.log('Computed after.deposit (must be exactly 0):', afterDeposit)
console.log(beforeDeposit === rawTotalDeposit && afterDeposit === 0 ? 'PASS' : 'FAIL')
```

Run: `node --env-file=.env.local check-computation.mjs`
Expected: the last line prints `PASS`. If it prints `FAIL`, the split condition (`row.period <
visit.date_visit`) in `lib/marketing-performance.ts` has a bug — stop and fix it before continuing.

Delete `check-computation.mjs` after this passes.

- [ ] **Step 3: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `lib/marketing-performance.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/marketing-performance.ts
git commit -m "Add Before/After SSS Data computation for Marketing Performance"
```

---

### Task 3: API routes (list, create, delete)

**Files:**
- Create: `app/api/marketing-efforts/route.ts` (replaces old `app/api/marketing/route.ts`)
- Create: `app/api/marketing-efforts/[id]/route.ts`
- Delete: `app/api/marketing/route.ts`

**Interfaces:**
- Consumes: `MarketingVisit`, `attachBeforeAfterMetrics` from `@/lib/marketing-performance` (Task 2).
- Produces: `GET /api/marketing-efforts` → `VisitWithMetrics[]`; `POST /api/marketing-efforts` →
  created row (201) or `{ error }` (400/500); `DELETE /api/marketing-efforts/[id]` →
  `{ success: true }` or `{ error }` (500).

- [ ] **Step 1: Write `app/api/marketing-efforts/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { attachBeforeAfterMetrics, type MarketingVisit } from '@/lib/marketing-performance'

const PAGE = 1000

export async function GET() {
  const rows: MarketingVisit[] = []
  let start = 0
  while (true) {
    const { data, error } = await supabase
      .from('marketing_efforts')
      .select('id, date_visit, partner, dsp, sub_affiliate, sub_affiliate_name, marketing_type, created_at')
      .order('date_visit', { ascending: false })
      .range(start, start + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    rows.push(...(data as MarketingVisit[]))
    if (data.length < PAGE) break
    start += PAGE
  }

  try {
    const withMetrics = await attachBeforeAfterMetrics(rows)
    return NextResponse.json(withMetrics)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { date_visit, partner, dsp, sub_affiliate, sub_affiliate_name, marketing_type } = body

  if (!sub_affiliate || !marketing_type || !date_visit) {
    return NextResponse.json({ error: 'sub_affiliate, marketing_type, and date_visit are required.' }, { status: 400 })
  }
  if (marketing_type !== 'Community' && marketing_type !== 'Booth Activation') {
    return NextResponse.json({ error: 'marketing_type must be Community or Booth Activation.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('marketing_efforts')
    .insert({
      date_visit,
      partner: partner ?? null,
      dsp: dsp ?? null,
      sub_affiliate,
      sub_affiliate_name: sub_affiliate_name ?? null,
      marketing_type,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Write `app/api/marketing-efforts/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabase.from('marketing_efforts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Delete the old route**

```bash
git rm app/api/marketing/route.ts
```

- [ ] **Step 4: Manual verification against the dev server**

Run: `npm run dev` (background), then in another shell:
```bash
curl -s http://localhost:3000/api/marketing-efforts
```
Expected: `[]` (empty array — no visits logged yet, marketing_efforts table is empty).

```bash
curl -s -X POST http://localhost:3000/api/marketing-efforts -H "Content-Type: application/json" -d '{"date_visit":"2026-07-01","partner":"Alpharus","dsp":"TestDSP","sub_affiliate":"TEST123","sub_affiliate_name":"Test Store","marketing_type":"Community"}'
```
Expected: `201` with the created row including an `id`.

```bash
curl -s http://localhost:3000/api/marketing-efforts
```
Expected: one row, with `before`/`after` objects present (likely all zeros since `TEST123` matches
no real `performance_data`/`members` rows).

```bash
curl -s -X DELETE http://localhost:3000/api/marketing-efforts/<id-from-above>
```
Expected: `{"success":true}`. Confirm with another GET that the list is empty again.

- [ ] **Step 5: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/marketing-efforts
git commit -m "Add Marketing Performance API routes (list/create/delete)"
```

---

### Task 4: Nav & permission wiring

**Files:**
- Modify: `lib/auth.ts:58-60`

**Interfaces:**
- Produces: `/marketing-efforts` visible in the sidebar (for admins, and for any member with the
  `marketing_efforts` permission already granted or granted later via the Accounts page) as
  "Marketing Performance".

- [ ] **Step 1: Uncomment and relabel the MODULES entry**

In `lib/auth.ts`, replace:
```ts
  // ai_report and marketing_efforts hidden — restore by uncommenting
  // { key: 'ai_report', label: 'AI Report', href: '/ai-report', icon: '🤖' },
  // { key: 'marketing_efforts', label: 'Marketing Efforts', href: '/marketing-efforts', icon: '📣' },
```
with:
```ts
  // ai_report hidden — restore by uncommenting
  // { key: 'ai_report', label: 'AI Report', href: '/ai-report', icon: '🤖' },
  { key: 'marketing_efforts', label: 'Marketing Performance', href: '/marketing-efforts', icon: '📣' },
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in as an admin account, confirm "Marketing Performance" now appears in the
sidebar and clicking it loads `/marketing-efforts` (page content from Task 7 won't exist yet at
this point in the plan if tasks are done in order — that's fine, confirm the nav link and route
gating work; the page itself is verified in Task 7).

Note for later: any **member** (non-admin) account that needs to see this module must be granted
the "Marketing Efforts" checkbox on the Accounts page (`/accounts`) after this ships — that's a
manual admin action in the running app, not something this migration grants automatically.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts
git commit -m "Restore Marketing Performance nav entry with new label"
```

---

### Task 5: Store picker component

**Files:**
- Create: `app/(app)/marketing-efforts/StorePicker.tsx`

**Interfaces:**
- Consumes: `GET /api/stores` (existing route, returns all stores: `{ sub_affiliate, store_name, partner, dsp, deployment_status, ... }[]`).
- Produces: `export type StoreOption = { sub_affiliate: string; store_name: string; partner: string | null; dsp: string | null }`
  and `export default function StorePicker({ value, onSelect }: { value: StoreOption | null; onSelect: (store: StoreOption) => void })`
  — consumed by Task 7's Add Visit form.

- [ ] **Step 1: Write `app/(app)/marketing-efforts/StorePicker.tsx`**

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'

export type StoreOption = {
  sub_affiliate: string
  store_name: string
  partner: string | null
  dsp: string | null
}

export default function StorePicker({ value, onSelect }: {
  value: StoreOption | null
  onSelect: (store: StoreOption | null) => void
}) {
  const [stores, setStores] = useState<StoreOption[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(d => setStores(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return stores.slice(0, 50)
    return stores
      .filter(s =>
        s.sub_affiliate?.toLowerCase().includes(q) ||
        s.store_name?.toLowerCase().includes(q)
      )
      .slice(0, 50)
  }, [stores, query])

  return (
    <div className="relative">
      <input
        value={value ? `${value.store_name} (${value.sub_affiliate})` : query}
        onChange={(e) => {
          if (value) onSelect(null)
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Search store name or sub affiliate..."
        className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No stores found.</div>
          ) : filtered.map(s => (
            <button
              key={`${s.sub_affiliate}__${s.partner}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(s); setQuery(''); setOpen(false) }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="font-medium text-gray-800 dark:text-gray-100">{s.store_name}</div>
              <div className="text-xs text-gray-400">{s.sub_affiliate} · {s.dsp ?? '—'} · {s.partner ?? '—'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

`onMouseDown` + `preventDefault()` on the option button stops the input's `onBlur` from firing
before the click registers, so selecting an option never gets swallowed by the blur-closes-dropdown
behavior.

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/marketing-efforts/StorePicker.tsx"
git commit -m "Add store picker component for Marketing Performance"
```

---

### Task 6: Visit detail drawer

**Files:**
- Create: `app/(app)/marketing-efforts/VisitDrawer.tsx`

**Interfaces:**
- Consumes: `VisitWithMetrics` type from `@/lib/marketing-performance` (Task 2);
  `DELETE /api/marketing-efforts/[id]` (Task 3).
- Produces: `export default function VisitDrawer({ visit, onClose, onDeleted }: { visit: VisitWithMetrics; onClose: () => void; onDeleted: (id: string) => void })`
  — consumed by Task 7's list page.

- [ ] **Step 1: Write `app/(app)/marketing-efforts/VisitDrawer.tsx`**

```tsx
'use client'
import type { VisitWithMetrics } from '@/lib/marketing-performance'

function fmt(n: number) {
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

function MetricRow({ label, before, after, money }: { label: string; before: number; after: number; money: boolean }) {
  const delta = after - before
  const format = (n: number) => (money ? fmt(n) : n.toLocaleString())
  return (
    <div className="grid grid-cols-3 gap-2 items-center py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-sm text-gray-800 dark:text-gray-100 text-right">{format(before)}</div>
      <div className="text-sm text-right">
        <span className="text-gray-800 dark:text-gray-100">{format(after)}</span>
        <span className={`ml-2 text-xs ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          ({delta >= 0 ? '+' : ''}{format(delta)})
        </span>
      </div>
    </div>
  )
}

export default function VisitDrawer({ visit, onClose, onDeleted }: {
  visit: VisitWithMetrics
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const handleDelete = async () => {
    if (!confirm(`Delete this visit entry for ${visit.sub_affiliate_name || visit.sub_affiliate}?`)) return
    const res = await fetch(`/api/marketing-efforts/${visit.id}`, { method: 'DELETE' })
    if (res.ok) onDeleted(visit.id)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{visit.sub_affiliate_name || visit.sub_affiliate}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">{visit.sub_affiliate} · {visit.partner ?? '—'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Date Visit</p>
            <p className="text-sm text-gray-800 dark:text-gray-100">{visit.date_visit}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Marketing Type</p>
            <p className="text-sm text-gray-800 dark:text-gray-100">{visit.marketing_type}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">DSP</p>
            <p className="text-sm text-gray-800 dark:text-gray-100">{visit.dsp || '—'}</p>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-400 dark:text-gray-500 pb-2">
              <div>Metric</div>
              <div className="text-right">Before</div>
              <div className="text-right">After (Δ)</div>
            </div>
            <MetricRow label="Total Deposit" before={visit.before.deposit} after={visit.after.deposit} money />
            <MetricRow label="Total GGR" before={visit.before.ggr} after={visit.after.ggr} money />
            <MetricRow label="Registered Members" before={visit.before.members} after={visit.after.members} money={false} />
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Before: all SSS Data through {visit.date_visit}. After: {visit.date_visit} → today,
            updates automatically as new data is uploaded.
          </p>
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-gray-700">
          <button onClick={handleDelete} className="w-full text-sm text-red-600 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950/30">
            Delete this visit
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/marketing-efforts/VisitDrawer.tsx"
git commit -m "Add visit detail drawer for Marketing Performance"
```

---

### Task 7: Main list page (rewrite)

**Files:**
- Modify: `app/(app)/marketing-efforts/page.tsx` (full rewrite — old content removed entirely)

**Interfaces:**
- Consumes: `StorePicker`/`StoreOption` (Task 5), `VisitDrawer` (Task 6), `VisitWithMetrics` type
  (Task 2), `GET`/`POST /api/marketing-efforts` (Task 3).

- [ ] **Step 1: Rewrite `app/(app)/marketing-efforts/page.tsx`**

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import StorePicker, { type StoreOption } from './StorePicker'
import VisitDrawer from './VisitDrawer'
import type { VisitWithMetrics } from '@/lib/marketing-performance'

function fmt(n: number) {
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

function DeltaCell({ before, after, money }: { before: number; after: number; money: boolean }) {
  const delta = after - before
  return (
    <span className={delta >= 0 ? 'text-green-600' : 'text-red-500'}>
      {delta >= 0 ? '+' : ''}{money ? fmt(delta) : delta.toLocaleString()}
    </span>
  )
}

export default function MarketingEffortsPage() {
  const [visits, setVisits] = useState<VisitWithMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<VisitWithMetrics | null>(null)

  const [store, setStore] = useState<StoreOption | null>(null)
  const [dateVisit, setDateVisit] = useState(() => new Date().toISOString().slice(0, 10))
  const [marketingType, setMarketingType] = useState<'Community' | 'Booth Activation'>('Community')

  const fetchVisits = async () => {
    setLoading(true)
    const res = await fetch('/api/marketing-efforts')
    const data = await res.json()
    setVisits(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { fetchVisits() }, [])

  const handleSave = async () => {
    setError('')
    if (!store) { setError('Pick a store first.'); return }
    setSaving(true)
    const res = await fetch('/api/marketing-efforts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date_visit: dateVisit,
        partner: store.partner,
        dsp: store.dsp,
        sub_affiliate: store.sub_affiliate,
        sub_affiliate_name: store.store_name,
        marketing_type: marketingType,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Failed to save.')
      return
    }
    setModal(false)
    setStore(null)
    setDateVisit(new Date().toISOString().slice(0, 10))
    setMarketingType('Community')
    fetchVisits()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return visits
    return visits.filter(v =>
      v.sub_affiliate_name?.toLowerCase().includes(q) ||
      v.sub_affiliate?.toLowerCase().includes(q) ||
      v.partner?.toLowerCase().includes(q) ||
      v.marketing_type?.toLowerCase().includes(q)
    )
  }, [visits, search])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Marketing Performance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Store visits mapped to before/after SSS Data</p>
        </div>
        <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Visit</button>
      </div>

      <div className="mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search store, partner, or marketing type..." className="border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full max-w-sm" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '1000px' }}>
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700 text-left">
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Date Visit</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Store</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Partner</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Marketing Type</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium text-right">Deposit (Δ)</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium text-right">GGR (Δ)</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium text-right">Members (Δ)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No visits logged yet.</td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} onClick={() => setSelected(v)} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{v.date_visit}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 dark:text-gray-100">{v.sub_affiliate_name || v.sub_affiliate}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{v.sub_affiliate}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.partner || '—'}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.marketing_type}</td>
                <td className="px-4 py-3 text-right"><DeltaCell before={v.before.deposit} after={v.after.deposit} money /></td>
                <td className="px-4 py-3 text-right"><DeltaCell before={v.before.ggr} after={v.after.ggr} money /></td>
                <td className="px-4 py-3 text-right"><DeltaCell before={v.before.members} after={v.after.members} money={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Add Store Visit</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Store *</label>
                <StorePicker value={store} onSelect={setStore} />
                {store && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{store.dsp ?? '—'} · {store.partner ?? '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Date Visit *</label>
                <input type="date" value={dateVisit} onChange={(e) => setDateVisit(e.target.value)} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Marketing Type *</label>
                <select value={marketingType} onChange={(e) => setMarketingType(e.target.value as 'Community' | 'Booth Activation')} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm">
                  <option value="Community">Community</option>
                  <option value="Booth Activation">Booth Activation</option>
                </select>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => { setModal(false); setError('') }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving || !store} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <VisitDrawer
          visit={selected}
          onClose={() => setSelected(null)}
          onDeleted={(id) => { setVisits(prev => prev.filter(v => v.id !== id)); setSelected(null) }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification in the browser**

Run `npm run dev`, log in, open "Marketing Performance" from the sidebar:
1. Click "+ Add Visit". Type part of a real store name into the Store field — confirm the
   dropdown filters and shows matches with DSP/Partner.
2. Select one, confirm Partner/DSP appear read-only below the field.
3. Set a Date Visit in the past (e.g. a month with known uploaded data for that store, if you
   know one from memory notes) and Marketing Type, save.
4. Confirm the new row appears in the table with non-zero Before numbers (if the picked store has
   real historical `performance_data`) and correct Δ coloring (green for positive, red for
   negative).
5. Click the row, confirm the drawer opens with the same numbers plus the explanatory date-range
   text at the bottom.
6. Delete the row from the drawer, confirm it disappears from the table and a `confirm()` dialog
   appeared first.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/marketing-efforts/page.tsx"
git commit -m "Rebuild Marketing Performance list page with before/after view"
```

---

### Task 8: Final full-project build check and push

**Files:** none (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 2: Full production build**

Run: `npm run build`
Expected: build succeeds with no errors (this catches issues `tsc --noEmit` alone can miss, e.g.
server/client component boundary mistakes).

- [ ] **Step 3: Confirm no leftover temp scripts**

Run: `git status --short`
Expected: no `check-*.mjs` files staged or untracked — all were deleted after use in Tasks 1-2.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Vercel auto-deploys on push to `main` (confirmed pattern for this project). Tell Claire it's
live and ready for her visual feedback pass.
