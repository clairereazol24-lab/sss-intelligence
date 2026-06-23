# SSS Data Overall Summary + Import/Export Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an all-time/period-filterable "Overall" totals card to the SSS Data page, and replace the drag-and-drop upload box with Import/Export buttons (Export downloads CSV, Import opens a file picker).

**Architecture:** Reuse the existing per-store aggregation already computed in `app/api/performance/route.ts` to add a small `overallTotals` field to its response (no duplicate aggregation logic). Add a new `app/api/export/route.ts` that queries raw `performance_data` rows (same period filter) and serializes them to CSV. Update `app/sss-data/page.tsx` to add a header with a period dropdown + Export/Import buttons, an Overall summary card, and remove the drag-and-drop box in favor of a hidden file input triggered by the Import button.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, Tailwind CSS (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually against `npm run dev` (API routes via `curl`, UI via browser). Do not introduce a test framework as part of this plan.
- Currency formatting must match the existing pattern used on the Performance page: `` `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` ``.
- CSV export must contain raw, unaggregated `performance_data` rows (one row per store per period) so it's a full, re-importable backup — not the aggregated totals.
- Do not change the existing upload flow logic (`handleFile`, `getPeriod`, `handleUpload`, the column-warning logic, the preview table, or the per-upload period selector) — only change how the file picker is triggered (button instead of drag-and-drop) and add new sections around it.
- Supabase client construction pattern (`createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)`) must match the existing routes in `app/api/performance/route.ts` and `app/api/upload/route.ts`.

---

### Task 1: Add `overallTotals` to `/api/performance` response

**Files:**
- Modify: `app/api/performance/route.ts`

**Interfaces:**
- Produces: `overallTotals` field on the JSON response — `{ total_deposit: number, total_withdraw: number, company_net_win: number, registered_members: number, deposit_member_count: number, effective_member: number, store_count: number }`. Task 2 consumes this field.

- [ ] **Step 1: Add the totals reduction right after `stores` is computed**

Find this line in `app/api/performance/route.ts`:

```ts
    const stores = Object.values(storeMap)
    const maxDeposit = Math.max(...stores.map((s: any) => s.total_deposit), 1)
```

Replace it with:

```ts
    const stores = Object.values(storeMap)

    const overallTotals = stores.reduce(
      (acc: any, s: any) => {
        acc.total_deposit += s.total_deposit
        acc.total_withdraw += s.total_withdraw
        acc.company_net_win += s.company_net_win
        acc.registered_members += s.registered_members
        acc.deposit_member_count += s.deposit_member_count
        acc.effective_member += s.effective_member
        acc.store_count += 1
        return acc
      },
      {
        total_deposit: 0,
        total_withdraw: 0,
        company_net_win: 0,
        registered_members: 0,
        deposit_member_count: 0,
        effective_member: 0,
        store_count: 0,
      }
    )

    const maxDeposit = Math.max(...stores.map((s: any) => s.total_deposit), 1)
```

- [ ] **Step 2: Include `overallTotals` in the response**

Find this line:

```ts
    return NextResponse.json({ top20Stores, top20DSPs, periods: uniquePeriods })
```

Replace it with:

```ts
    return NextResponse.json({ top20Stores, top20DSPs, periods: uniquePeriods, overallTotals })
```

- [ ] **Step 3: Verify manually with the dev server**

Run:

```bash
npm run dev
```

In another terminal:

```bash
curl -s "http://localhost:3000/api/performance?period=all" | head -c 500
```

Expected: JSON output containing an `"overallTotals":{"total_deposit":...,"store_count":...}` field. If you have no rows uploaded yet, expect all numeric fields to be `0` and `store_count: 0` — this is correct, not an error.

- [ ] **Step 4: Commit**

```bash
git add app/api/performance/route.ts
git commit -m "Add overallTotals to /api/performance response"
```

---

### Task 2: Add Overall summary card + period dropdown to SSS Data page

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Consumes: `GET /api/performance?period=<string>` → `{ periods: string[], overallTotals: { total_deposit: number, total_withdraw: number, company_net_win: number, registered_members: number, deposit_member_count: number, effective_member: number, store_count: number } }` (from Task 1).
- Produces: `overallPeriod` state (string, the dropdown's selected value) and `fmt` helper — both used by Task 5 (Export button).

- [ ] **Step 1: Add new state and a `fmt` helper at the top of the component**

Find this block near the top of `app/sss-data/page.tsx`:

```tsx
export default function SSSDataPage() {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [periodType, setPeriodType] = useState<'monthly' | 'daily'>('monthly')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [date, setDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasPartner, setHasPartner] = useState(false)
  const [hasDSP, setHasDSP] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
```

Replace it with (adds the overall-summary state plus a `useEffect`/`fmt` import):

```tsx
const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type OverallTotals = {
  total_deposit: number
  total_withdraw: number
  company_net_win: number
  registered_members: number
  deposit_member_count: number
  effective_member: number
  store_count: number
}

export default function SSSDataPage() {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [periodType, setPeriodType] = useState<'monthly' | 'daily'>('monthly')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [date, setDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasPartner, setHasPartner] = useState(false)
  const [hasDSP, setHasDSP] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [overallPeriod, setOverallPeriod] = useState('all')
  const [overallPeriods, setOverallPeriods] = useState<string[]>([])
  const [overallTotals, setOverallTotals] = useState<OverallTotals | null>(null)
  const [overallLoading, setOverallLoading] = useState(false)
  const [overallError, setOverallError] = useState<string | null>(null)

  const fetchOverall = async (period: string) => {
    setOverallLoading(true)
    setOverallError(null)
    try {
      const res = await fetch(`/api/performance?period=${period}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOverallTotals(data.overallTotals)
      if (data.periods) setOverallPeriods(data.periods)
    } catch (err: any) {
      setOverallError(err.message || 'Failed to load overall totals.')
    } finally {
      setOverallLoading(false)
    }
  }

  useEffect(() => { fetchOverall('all') }, [])

  const handleOverallPeriodChange = (p: string) => {
    setOverallPeriod(p)
    fetchOverall(p)
  }
```

- [ ] **Step 2: Import `useEffect`**

Find this line near the top of the file:

```tsx
import { useState, useRef } from 'react'
```

Replace it with:

```tsx
import { useState, useRef, useEffect } from 'react'
```

- [ ] **Step 3: Replace the page header with a header row (title left, period dropdown right) and add the Overall card below it**

Find this block:

```tsx
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">SSS Data</h1>
      <p className="text-sm text-gray-500 mb-6">Upload your sub-affiliate CSV export here.</p>

      {/* Upload Area */}
```

Replace it with:

```tsx
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">SSS Data</h1>
          <p className="text-sm text-gray-500">Upload your sub-affiliate CSV export here.</p>
        </div>
        <select
          value={overallPeriod}
          onChange={(e) => handleOverallPeriodChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
        >
          <option value="all">All Time</option>
          {overallPeriods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Overall summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-700 mb-3">Overall</h2>
        {overallError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-3 text-sm">❌ {overallError}</div>
        )}
        {overallLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Total Deposit</p>
              <p className="font-semibold text-gray-800">{fmt(overallTotals?.total_deposit || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Total GGR</p>
              <p className={`font-semibold ${((overallTotals?.company_net_win || 0) >= 0) ? 'text-green-600' : 'text-red-500'}`}>{fmt(overallTotals?.company_net_win || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Registered Members</p>
              <p className="font-semibold text-gray-800">{(overallTotals?.registered_members || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Stores</p>
              <p className="font-semibold text-gray-800">{overallTotals?.store_count || 0}</p>
            </div>
          </div>
        )}
        {!overallLoading && !overallError && (overallTotals?.store_count || 0) === 0 && (
          <p className="text-xs text-gray-400 mt-3">No data yet — upload a CSV below.</p>
        )}
      </div>

      {/* Upload Area */}
```

- [ ] **Step 4: Verify manually in the browser**

Run `npm run dev`, open `http://localhost:3000/sss-data`. Expected: an "Overall" card appears below the header showing zeros (or your real totals if you've already uploaded data via the SQL editor/earlier uploads), a period dropdown next to the title showing "All Time" plus any periods you've uploaded, and changing the dropdown re-fetches and updates the card's numbers. The existing drag-and-drop box should still be present and unchanged below it (it gets replaced in Task 3).

- [ ] **Step 5: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Add Overall summary card and period dropdown to SSS Data page"
```

---

### Task 3: Replace drag-and-drop box with an Import button

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Consumes: existing `handleFile(f: File)` function and `fileRef` (both already defined in this file — unchanged).
- Produces: none new — this is a UI-only change.

- [ ] **Step 1: Replace the drag-and-drop box with an Import button**

Find this block:

```tsx
      {/* Upload Area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors mb-6"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <div className="text-4xl mb-2">📤</div>
        <p className="text-gray-600 font-medium">{file ? file.name : 'Click or drag CSV file here'}</p>
        <p className="text-xs text-gray-400 mt-1">Make sure to add Partner and DSP columns before uploading</p>
      </div>
```

Replace it with:

```tsx
      {/* Upload Area */}
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div>
          <p className="text-gray-700 font-medium">{file ? file.name : 'No file selected'}</p>
          <p className="text-xs text-gray-400 mt-1">Make sure to add Partner and DSP columns before uploading</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm whitespace-nowrap"
        >
          📤 Import CSV
        </button>
      </div>
```

- [ ] **Step 2: Verify manually in the browser**

Reload `http://localhost:3000/sss-data`. Expected: the drag-and-drop box is gone, replaced by a row showing "No file selected" and an "Import CSV" button. Click the button — the file picker opens. Pick a CSV — the filename appears in place of "No file selected", and the column warnings / period selector / preview table / "Upload N Records" button all appear below exactly as before.

- [ ] **Step 3: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Replace drag-and-drop box with Import button on SSS Data page"
```

---

### Task 4: Create `/api/export` route

**Files:**
- Create: `app/api/export/route.ts`

**Interfaces:**
- Produces: `GET /api/export?period=all|<period>` → CSV text response with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="performance_data.csv"`. Task 5 consumes this endpoint.

- [ ] **Step 1: Create the export route**

Create `app/api/export/route.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CSV_COLUMNS = [
  'sub_affiliate', 'store_name', 'period', 'period_type',
  'total_deposit', 'total_withdraw', 'valid_bet_amount', 'company_net_win',
  'payout_amount', 'total_promotion_amount', 'registered_members',
  'first_deposit_amount', 'first_deposit_count', 'deposit_member_count',
  'members_withdrawn', 'effective_member', 'partner', 'dsp',
] as const

function toCsv(rows: Record<string, any>[]) {
  const header = CSV_COLUMNS.join(',')
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((col) => {
      const value = row[col]
      if (value === null || value === undefined) return ''
      const str = String(value)
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
    }).join(',')
  )
  return [header, ...lines].join('\n')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')

    let query = supabase.from('performance_data').select('*').order('period', { ascending: false })
    if (period && period !== 'all') {
      query = query.eq('period', period)
    }

    const { data, error } = await query
    if (error) throw error

    const csv = toCsv(data || [])

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="performance_data.csv"',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify manually with curl**

With `npm run dev` running:

```bash
curl -s "http://localhost:3000/api/export?period=all" | head -5
```

Expected: first line is the CSV header (`sub_affiliate,store_name,period,period_type,...`), followed by data rows if any exist, or just the header line if `performance_data` is empty — both are correct, not errors.

```bash
curl -sI "http://localhost:3000/api/export?period=all" | grep -i content-type
```

Expected: `content-type: text/csv`.

- [ ] **Step 3: Commit**

```bash
git add app/api/export/route.ts
git commit -m "Add /api/export route for CSV export of performance_data"
```

---

### Task 5: Wire up Export button on SSS Data page

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Consumes: `GET /api/export?period=<string>` (from Task 4), `overallPeriod` state (from Task 2).

- [ ] **Step 1: Add an export handler function**

Find this block (added in Task 2):

```tsx
  const handleOverallPeriodChange = (p: string) => {
    setOverallPeriod(p)
    fetchOverall(p)
  }
```

Replace it with:

```tsx
  const handleOverallPeriodChange = (p: string) => {
    setOverallPeriod(p)
    fetchOverall(p)
  }

  const handleExport = async () => {
    setOverallError(null)
    try {
      const res = await fetch(`/api/export?period=${overallPeriod}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Export failed.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'performance_data.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setOverallError(err.message || 'Export failed.')
    }
  }
```

- [ ] **Step 2: Add the Export button next to the period dropdown**

Find this block (added in Task 2):

```tsx
        <select
          value={overallPeriod}
          onChange={(e) => handleOverallPeriodChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
        >
          <option value="all">All Time</option>
          {overallPeriods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
```

Replace it with:

```tsx
        <div className="flex items-center gap-3">
          <select
            value={overallPeriod}
            onChange={(e) => handleOverallPeriodChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
          >
            <option value="all">All Time</option>
            {overallPeriods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            onClick={handleExport}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg shadow-sm transition-colors text-sm whitespace-nowrap"
          >
            ⬇️ Export
          </button>
        </div>
      </div>
```

- [ ] **Step 3: Verify manually in the browser**

Reload `http://localhost:3000/sss-data`. Click **Export** with "All Time" selected — a `performance_data.csv` file should download containing every uploaded row. Change the period dropdown to a specific period and click **Export** again — the downloaded file should contain only rows for that period. If `performance_data` is empty, the download should still succeed with just a header row (no error banner).

- [ ] **Step 4: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Wire up Export button on SSS Data page"
```
