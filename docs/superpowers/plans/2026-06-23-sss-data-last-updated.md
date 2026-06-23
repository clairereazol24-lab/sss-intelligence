# SSS Data Last Updated Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small "Last updated: <period>" text line below the Overall card on the SSS Data page, reflecting the single most recently uploaded period regardless of the From/To filter.

**Architecture:** `app/api/performance/route.ts` gets one more small query — the most recently created `performance_data` row, ordered by `created_at` (not by comparing `period` strings, which sidesteps the monthly/daily format-mixing limitation) — exposed as a new `lastUpdated` response field. The SSS Data page reads it via the existing `fetchOverall` call and renders a formatted text line.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, Tailwind CSS (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually (curl for the API, browser/tsc for the UI).
- `lastUpdated` is never filtered by the `period`/`from`/`to` query params already in the route — it always reflects the single most recent upload across all data.
- Ordered by `created_at` (actual upload timestamp), not by comparing `period` strings.
- If there is no data at all, `lastUpdated` is `null` and the UI line does not render.

---

### Task 1: Add `lastUpdated` to `/api/performance`

**Files:**
- Modify: `app/api/performance/route.ts`

**Interfaces:**
- Produces: the route's JSON response gains a new field `lastUpdated: { period: string, period_type: string } | null`. Task 2 consumes this field by name.

- [ ] **Step 1: Query the most recently created row and add it to the response**

Find this block in `app/api/performance/route.ts`:

```ts
    // Available periods
    const { data: periods } = await supabase
      .from('performance_data')
      .select('period')
      .order('period', { ascending: false })

    const uniquePeriods = Array.from(new Set((periods || []).map((p: any) => p.period)))

    return NextResponse.json({ top20Stores, top20DSPs, periods: uniquePeriods, overallTotals, allStores })
```

Replace it with:

```ts
    // Available periods
    const { data: periods } = await supabase
      .from('performance_data')
      .select('period')
      .order('period', { ascending: false })

    const uniquePeriods = Array.from(new Set((periods || []).map((p: any) => p.period)))

    // Most recently uploaded row, regardless of any period/from/to filter above
    const { data: lastRow } = await supabase
      .from('performance_data')
      .select('period, period_type')
      .order('created_at', { ascending: false })
      .limit(1)

    const lastUpdated = lastRow && lastRow.length > 0 ? lastRow[0] : null

    return NextResponse.json({ top20Stores, top20DSPs, periods: uniquePeriods, overallTotals, allStores, lastUpdated })
```

- [ ] **Step 2: Verify manually with curl**

With `npm run dev` running:

```bash
curl -s "http://localhost:3000/api/performance" | grep -o '"lastUpdated":[^}]*}'
```

Expected: `"lastUpdated":{"period":"...","period_type":"..."}` if data exists, or `"lastUpdated":null` if the table is empty. Confirm it stays the same value when you add `?from=...&to=...` params that exclude the most recent row — `lastUpdated` must not change based on those params.

- [ ] **Step 3: Commit**

```bash
git add app/api/performance/route.ts
git commit -m "Add lastUpdated field to /api/performance"
```

---

### Task 2: Render the Last Updated line on the SSS Data page

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Consumes: `GET /api/performance` response field `lastUpdated` (from Task 1).
- Produces: none new — final consumer in this plan.

- [ ] **Step 1: Add the `LastUpdated` type**

Find this block in `app/sss-data/page.tsx`:

```ts
type StoreRow = {
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
}
```

Replace it with:

```ts
type StoreRow = {
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
}

type LastUpdated = {
  period: string
  period_type: string
}
```

- [ ] **Step 2: Add `lastUpdated` state and populate it in `fetchOverall`**

Find this block in `app/sss-data/page.tsx`:

```ts
  const [overallFrom, setOverallFrom] = useState('')
  const [overallTo, setOverallTo] = useState('')
  const [overallTotals, setOverallTotals] = useState<OverallTotals | null>(null)
  const [overallLoading, setOverallLoading] = useState(false)
  const [overallError, setOverallError] = useState<string | null>(null)
  const [allStores, setAllStores] = useState<StoreRow[]>([])

  const fetchOverall = async (from: string, to: string) => {
    setOverallLoading(true)
    setOverallError(null)
    try {
      const query = from && to ? `?from=${from}&to=${to}` : ''
      const res = await fetch(`/api/performance${query}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOverallTotals(data.overallTotals)
      setAllStores(data.allStores || [])
    } catch (err: any) {
      setOverallError(err.message || 'Failed to load overall totals.')
    } finally {
      setOverallLoading(false)
    }
  }
```

Replace it with:

```ts
  const [overallFrom, setOverallFrom] = useState('')
  const [overallTo, setOverallTo] = useState('')
  const [overallTotals, setOverallTotals] = useState<OverallTotals | null>(null)
  const [overallLoading, setOverallLoading] = useState(false)
  const [overallError, setOverallError] = useState<string | null>(null)
  const [allStores, setAllStores] = useState<StoreRow[]>([])
  const [lastUpdated, setLastUpdated] = useState<LastUpdated | null>(null)

  const fetchOverall = async (from: string, to: string) => {
    setOverallLoading(true)
    setOverallError(null)
    try {
      const query = from && to ? `?from=${from}&to=${to}` : ''
      const res = await fetch(`/api/performance${query}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOverallTotals(data.overallTotals)
      setAllStores(data.allStores || [])
      setLastUpdated(data.lastUpdated || null)
    } catch (err: any) {
      setOverallError(err.message || 'Failed to load overall totals.')
    } finally {
      setOverallLoading(false)
    }
  }
```

- [ ] **Step 3: Add the `formatLastUpdated` helper**

Find this block in `app/sss-data/page.tsx`:

```ts
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

  return (
    <div className="p-6">
```

Replace it with:

```ts
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const formatLastUpdated = (lu: LastUpdated | null) => {
    if (!lu) return null
    if (lu.period_type === 'monthly') {
      const [y, m] = lu.period.split('-')
      return `${monthNames[parseInt(m, 10) - 1]} ${y}`
    }
    return new Date(lu.period + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div className="p-6">
```

- [ ] **Step 4: Render the Last Updated line below the Overall card**

Find this block in `app/sss-data/page.tsx`:

```tsx
        {!overallLoading && !overallError && (overallTotals?.store_count || 0) === 0 && (
          <p className="text-xs text-gray-400 mt-3">No data yet — upload a CSV below.</p>
        )}
      </div>

      {/* Store Summary */}
```

Replace it with:

```tsx
        {!overallLoading && !overallError && (overallTotals?.store_count || 0) === 0 && (
          <p className="text-xs text-gray-400 mt-3">No data yet — upload a CSV below.</p>
        )}
      </div>

      {lastUpdated && (
        <p className="text-xs text-gray-400 mb-6">Last updated: {formatLastUpdated(lastUpdated)}</p>
      )}

      {/* Store Summary */}
```

- [ ] **Step 5: Verify manually**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, reload `http://localhost:3000/sss-data`. Expected: if data exists, a small gray "Last updated: <Month> <Year>" or "Last updated: <Month> <Day>, <Year>" line appears between the Overall card and the Store Summary table. Change the From/To date inputs to a range that excludes the most recent upload and confirm the "Last updated" line does **not** change. With no data uploaded at all, confirm the line doesn't render.

- [ ] **Step 6: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Render Last Updated indicator on SSS Data page"
```
