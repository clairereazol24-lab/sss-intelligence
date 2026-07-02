# Locked Retailers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Locked Retailers" page where Claire pastes a list of locked Sub Affiliate IDs and downloads an `.xlsx` report of their all-time sales totals, ranked by DSP, so she knows which DSP to chase for uncollected deposits.

**Architecture:** A stateless POST API route aggregates existing `performance_data` (and `stores` as fallback) for the requested IDs and streams back a generated `.xlsx` workbook. A new client page provides the paste box and triggers the download. No new database tables.

**Tech Stack:** Next.js 14 App Router, Supabase (`supabaseAdmin`), `xlsx` (SheetJS) — all existing project dependencies.

## Global Constraints

- Totals are always **all-time cumulative** across every `performance_data` row for a `sub_affiliate` — no date filtering (per spec).
- Matching is by **Sub Affiliate ID only** — `stores.sub_affiliate` is globally unique, so no partner disambiguation is needed (per spec).
- Output is exactly **3 sheets** in this order: `Locked Retailers`, `DSP Summary`, `Not Found` (per spec).
- Sheet 1 and Sheet 2 are both sorted by **Total Deposit descending** (per spec).
- The whole flow is **stateless** — nothing is written to the database, no new tables/migrations (per spec).
- No AI-generated narrative anywhere in this feature (per spec).
- No automated test suite exists in this project — verification is manual, via `curl` for the API and the browser for the UI (per project convention, confirmed: no vitest/jest config present).

---

### Task 1: Locked Retailers API route

**Files:**
- Create: `app/api/locked-retailers/route.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/lib/supabase-admin` (existing); `performance_data` and `stores` tables (existing schema, no changes).
- Produces: `POST /api/locked-retailers` accepting JSON body `{ subAffiliateIds: string[] }`, returning a binary `.xlsx` response (200) with headers `X-Matched-Count` and `X-Not-Found-Count`, or `{ error: string }` JSON (400/500). Task 2's frontend depends on this exact contract.

- [ ] **Step 1: Write the route handler**

Create `app/api/locked-retailers/route.ts`:

```typescript
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

type StoreTotals = {
  sub_affiliate: string
  store_name: string
  partner: string | null
  dsp: string | null
  total_deposit: number
  total_withdraw: number
  valid_bet_amount: number
  company_net_win: number
  payout_amount: number
  registered_members: number
  deposit_member_count: number
  effective_member: number
}

const emptyTotals = (sub_affiliate: string, store_name: string, partner: string | null, dsp: string | null): StoreTotals => ({
  sub_affiliate,
  store_name,
  partner,
  dsp,
  total_deposit: 0,
  total_withdraw: 0,
  valid_bet_amount: 0,
  company_net_win: 0,
  payout_amount: 0,
  registered_members: 0,
  deposit_member_count: 0,
  effective_member: 0,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rawIds: unknown = body?.subAffiliateIds
    const ids = Array.from(
      new Set(
        (Array.isArray(rawIds) ? rawIds : [])
          .map((id) => String(id).trim())
          .filter((id) => id.length > 0)
      )
    )

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No Sub Affiliate IDs provided.' }, { status: 400 })
    }

    // Paginate performance_data for the requested IDs (same pagination pattern as app/api/performance/route.ts)
    const allData: any[] = []
    let start = 0
    const PAGE = 1000
    while (true) {
      const { data: page, error } = await supabase
        .from('performance_data')
        .select(
          'sub_affiliate, store_name, partner, dsp, total_deposit, total_withdraw, valid_bet_amount, company_net_win, payout_amount, registered_members, deposit_member_count, effective_member'
        )
        .in('sub_affiliate', ids)
        .range(start, start + PAGE - 1)
      if (error) throw error
      if (!page || page.length === 0) break
      allData.push(...page)
      if (page.length < PAGE) break
      start += PAGE
    }

    // Aggregate all-time totals per sub_affiliate
    const storeMap: Record<string, StoreTotals> = {}
    for (const row of allData) {
      const key = row.sub_affiliate
      if (!storeMap[key]) {
        storeMap[key] = emptyTotals(row.sub_affiliate, row.store_name, row.partner, row.dsp)
      }
      const s = storeMap[key]
      s.total_deposit += row.total_deposit ?? 0
      s.total_withdraw += row.total_withdraw ?? 0
      s.valid_bet_amount += row.valid_bet_amount ?? 0
      s.company_net_win += row.company_net_win ?? 0
      s.payout_amount += row.payout_amount ?? 0
      s.registered_members += row.registered_members ?? 0
      s.deposit_member_count += row.deposit_member_count ?? 0
      s.effective_member += row.effective_member ?? 0
    }

    // Fall back to the stores directory for IDs with no performance_data rows
    const missingIds = ids.filter((id) => !storeMap[id])
    if (missingIds.length > 0) {
      const { data: dirStores, error: dirError } = await supabase
        .from('stores')
        .select('sub_affiliate, store_name, partner, dsp')
        .in('sub_affiliate', missingIds)
      if (dirError) throw dirError
      for (const ds of dirStores || []) {
        storeMap[ds.sub_affiliate] = emptyTotals(ds.sub_affiliate, ds.store_name, ds.partner, ds.dsp)
      }
    }

    const matched = Object.values(storeMap).sort((a, b) => b.total_deposit - a.total_deposit)
    const notFound = ids.filter((id) => !storeMap[id])

    // DSP rollup
    const dspMap: Record<
      string,
      { dsp: string; retailer_count: number; total_deposit: number; valid_bet_amount: number; company_net_win: number }
    > = {}
    for (const s of matched) {
      const key = s.dsp || 'Unknown'
      if (!dspMap[key]) {
        dspMap[key] = { dsp: key, retailer_count: 0, total_deposit: 0, valid_bet_amount: 0, company_net_win: 0 }
      }
      dspMap[key].retailer_count += 1
      dspMap[key].total_deposit += s.total_deposit
      dspMap[key].valid_bet_amount += s.valid_bet_amount
      dspMap[key].company_net_win += s.company_net_win
    }
    const dspSummary = Object.values(dspMap).sort((a, b) => b.total_deposit - a.total_deposit)

    // Build the 3-sheet workbook
    const wb = XLSX.utils.book_new()

    const ws1 = XLSX.utils.aoa_to_sheet([
      [
        'Sub Affiliate', 'Store Name', 'Partner', 'DSP', 'Total Deposit', 'Total Withdraw',
        'Valid Bet Amount', 'Company Net Win (GGR)', 'Payout Amount', 'Registered Members',
        'Deposit Member Count', 'Effective Member',
      ],
      ...matched.map((s) => [
        s.sub_affiliate, s.store_name, s.partner ?? '', s.dsp ?? '',
        s.total_deposit, s.total_withdraw, s.valid_bet_amount, s.company_net_win,
        s.payout_amount, s.registered_members, s.deposit_member_count, s.effective_member,
      ]),
    ])
    XLSX.utils.book_append_sheet(wb, ws1, 'Locked Retailers')

    const ws2 = XLSX.utils.aoa_to_sheet([
      ['DSP', 'Locked Retailer Count', 'Total Deposit', 'Valid Bet Amount', 'Company Net Win (GGR)'],
      ...dspSummary.map((d) => [d.dsp, d.retailer_count, d.total_deposit, d.valid_bet_amount, d.company_net_win]),
    ])
    XLSX.utils.book_append_sheet(wb, ws2, 'DSP Summary')

    const ws3 = XLSX.utils.aoa_to_sheet([['Sub Affiliate'], ...notFound.map((id) => [id])])
    XLSX.utils.book_append_sheet(wb, ws3, 'Not Found')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const today = new Date().toISOString().slice(0, 10)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="locked-retailers-${today}.xlsx"`,
        'X-Matched-Count': String(matched.length),
        'X-Not-Found-Count': String(notFound.length),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate report.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Start the dev server**

Run: `npm run dev` (from `C:\Users\RAC-CLAIRE\Desktop\sss-intelligence`)
Expected: `Ready in <N>s`, note the port it prints (3000, or 3001 if 3000 is taken).

- [ ] **Step 3: Get two real Sub Affiliate IDs to test with**

Open `http://localhost:<port>/sss-data/alpharus` (or `/relevant-tech`) in a browser while logged in, and copy two `Sub Affiliate` values from the store summary table. You'll use one real ID and one made-up ID (e.g. `DOES-NOT-EXIST-123`) in the next step.

- [ ] **Step 4: Verify the route with curl (replace `<REAL_ID>` and `<port>`)**

Run from `C:\Users\RAC-CLAIRE\Desktop\sss-intelligence` (the test file is a local scratch artifact, not committed):
```bash
curl -sD - -o ./locked-retailers-test.xlsx -X POST http://localhost:<port>/api/locked-retailers \
  -H "Content-Type: application/json" \
  -d '{"subAffiliateIds":["<REAL_ID>","<REAL_ID>","DOES-NOT-EXIST-123"]}'
```
Expected: Response headers include `HTTP/1.1 200`, `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `content-disposition: attachment; filename="locked-retailers-<today's date>.xlsx"`, `x-matched-count: 1`, `x-not-found-count: 1` (the duplicate `<REAL_ID>` should be deduped to 1 match). Confirm the saved file (`ls -la ./locked-retailers-test.xlsx`) is non-empty.

- [ ] **Step 5: Verify the workbook contents**

Run from `C:\Users\RAC-CLAIRE\Desktop\sss-intelligence` (so `require('xlsx')` resolves against the project's `node_modules`):
```bash
node -e "const XLSX=require('xlsx');const wb=XLSX.readFile('./locked-retailers-test.xlsx');console.log(wb.SheetNames);console.log(XLSX.utils.sheet_to_json(wb.Sheets['Locked Retailers']));console.log(XLSX.utils.sheet_to_json(wb.Sheets['DSP Summary']));console.log(XLSX.utils.sheet_to_json(wb.Sheets['Not Found']));"
```
Expected: `SheetNames` is `[ 'Locked Retailers', 'DSP Summary', 'Not Found' ]`; the `Locked Retailers` row's `Sub Affiliate` matches `<REAL_ID>` with the same `Total Deposit` shown in the SSS Data UI for that store; `DSP Summary` has one row with `Locked Retailer Count: 1`; `Not Found` has one row `{"Sub Affiliate":"DOES-NOT-EXIST-123"}`.

Then delete the scratch file: `rm ./locked-retailers-test.xlsx`

- [ ] **Step 6: Verify the empty-body error case**

Run: `curl -s -X POST http://localhost:<port>/api/locked-retailers -H "Content-Type: application/json" -d '{"subAffiliateIds":[]}'`
Expected: `{"error":"No Sub Affiliate IDs provided."}`

- [ ] **Step 7: Commit**

```bash
git add app/api/locked-retailers/route.ts
git commit -m "Add Locked Retailers API route: aggregate + generate xlsx report"
```

---

### Task 2: Locked Retailers page, nav entry, and download UI

**Files:**
- Modify: `lib/auth.ts` — add `'locked_retailers'` to `ModuleKey` and a new entry to `MODULES`
- Create: `app/(app)/locked-retailers/page.tsx`
- Create: `app/(app)/locked-retailers/LockedRetailersClient.tsx`

**Interfaces:**
- Consumes: `POST /api/locked-retailers` from Task 1 — body `{ subAffiliateIds: string[] }`, response is a binary `.xlsx` (200) with `X-Matched-Count`/`X-Not-Found-Count` headers, or `{ error: string }` JSON (400/500).
- Produces: A page at `/locked-retailers`, visible in the sidebar nav (admins get access automatically per `lib/auth.ts`'s existing `getUserAccess` — no separate permission grant needed).

- [ ] **Step 1: Register the module**

In `lib/auth.ts`, change line 3 from:
```typescript
export type ModuleKey = 'dashboard' | 'sss_data' | 'members' | 'performance' | 'store_directory' | 'ai_report' | 'marketing_efforts'
```
to:
```typescript
export type ModuleKey = 'dashboard' | 'sss_data' | 'members' | 'performance' | 'store_directory' | 'locked_retailers' | 'ai_report' | 'marketing_efforts'
```

Then add a new entry to the `MODULES` array (after the `store_directory` entry, before the commented-out `ai_report`/`marketing_efforts` lines):
```typescript
  { key: 'locked_retailers', label: 'Locked Retailers', href: '/locked-retailers', icon: '🔒' },
```

- [ ] **Step 2: Create the page shell**

Create `app/(app)/locked-retailers/page.tsx`:
```typescript
import LockedRetailersClient from './LockedRetailersClient'

export default function Page() {
  return <LockedRetailersClient />
}
```

- [ ] **Step 3: Create the client component**

Create `app/(app)/locked-retailers/LockedRetailersClient.tsx`:
```typescript
'use client'

import { useMemo, useState } from 'react'

function parseIds(raw: string): string[] {
  const pieces = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return Array.from(new Set(pieces))
}

export default function LockedRetailersClient() {
  const [raw, setRaw] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const ids = useMemo(() => parseIds(raw), [raw])

  const handleGenerate = async () => {
    setError(null)
    setResult(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/locked-retailers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subAffiliateIds: ids }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate report.')
      }
      const matchedCount = res.headers.get('X-Matched-Count') ?? '0'
      const notFoundCount = res.headers.get('X-Not-Found-Count') ?? '0'

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `locked-retailers-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setResult(
        Number(notFoundCount) > 0
          ? `✅ ${matchedCount} matched, ${notFoundCount} not found.`
          : `✅ ${matchedCount} matched.`
      )
    } catch (err: any) {
      setError(err.message || 'Failed to generate report.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">Locked Retailers</h1>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
        Paste locked Sub Affiliate IDs to download their all-time sales totals, ranked by DSP.
      </p>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="One Sub Affiliate ID per line, or comma-separated"
        rows={10}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 font-mono"
      />

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 mb-4">
        {ids.length} ID{ids.length === 1 ? '' : 's'} parsed
      </p>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          ❌ {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {result}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={ids.length === 0 || generating}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {generating ? 'Generating…' : 'Generate & Download Excel'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Restart the dev server**

Run: `npm run dev`
Expected: `Ready in <N>s`, no TypeScript errors printed.

- [ ] **Step 5: Verify in the browser**

1. Log in and confirm **Locked Retailers** (🔒) now appears in the sidebar nav.
2. Click it, confirm the page loads with the empty textarea and a disabled button.
3. Paste one real Sub Affiliate ID (from Task 1's Step 3) plus `DOES-NOT-EXIST-123`, confirm the count reads "2 IDs parsed" and the button becomes enabled.
4. Click **Generate & Download Excel**, confirm a file downloads named `locked-retailers-<today>.xlsx`, and the inline banner reads "✅ 1 matched, 1 not found."
5. Open the downloaded file and confirm it has the same 3 sheets with the same data verified via curl in Task 1.
6. Clear the textarea, confirm the button becomes disabled again.

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors (per project convention — see `[[project_code_quality]]`, always run before pushing).

- [ ] **Step 7: Commit**

```bash
git add lib/auth.ts "app/(app)/locked-retailers/page.tsx" "app/(app)/locked-retailers/LockedRetailersClient.tsx"
git commit -m "Add Locked Retailers page: nav entry, paste input, and download flow"
```
