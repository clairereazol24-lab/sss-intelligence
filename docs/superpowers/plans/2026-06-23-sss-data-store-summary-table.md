# SSS Data Store Summary Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-store "Store Summary" table to the SSS Data page, below the Overall card, showing every store's totals (summed across uploads) for the selected date range.

**Architecture:** `app/api/performance/route.ts` already aggregates `performance_data` rows into a per-store map keyed by `sub_affiliate`. Add `valid_bet_amount`/`payout_amount` to that existing sum and expose the full per-store list (sorted by deposit, uncapped) as a new `allStores` response field. The SSS Data page's existing `fetchOverall` call (already used for the Overall card) reads this new field and renders it as a table.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, Tailwind CSS (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually (curl for the API, browser/tsc for the UI).
- The Performance page and its `top20Stores` field are untouched — `allStores` is a new, separate field; `top20Stores`'s existing top-20 slice and `score`/`label` logic must keep working exactly as before.
- No new API endpoint — extend the existing `/api/performance` route, not a new one.
- No pagination — show every store, in a scrollable container (no row cap).
- Each row is deduplicated by `sub_affiliate` — a store appearing in multiple uploads/periods within the selected range gets one row with summed totals, never multiple rows.

---

### Task 1: Add `valid_bet_amount`/`payout_amount` sums and `allStores` to `/api/performance`

**Files:**
- Modify: `app/api/performance/route.ts`

**Interfaces:**
- Produces: the route's JSON response gains a new field `allStores: StoreRow[]`, where each item has `sub_affiliate`, `store_name`, `partner`, `dsp`, `total_deposit`, `total_withdraw`, `valid_bet_amount`, `company_net_win`, `payout_amount`, `registered_members` (plus pre-existing internal fields `deposit_member_count`, `members_withdrawn`, `effective_member`, `first_deposit_count`, harmless to leave on the object). Sorted by `total_deposit` descending, uncapped. Task 2 consumes this field by name.

- [ ] **Step 1: Add the two new summed fields to the per-store aggregation**

Find this block in `app/api/performance/route.ts`:

```ts
    // Aggregate by store (sum across periods if multiple)
    const storeMap: Record<string, any> = {}
    for (const row of data || []) {
      if (!storeMap[row.sub_affiliate]) {
        storeMap[row.sub_affiliate] = {
          sub_affiliate: row.sub_affiliate,
          store_name: row.store_name,
          partner: row.partner,
          dsp: row.dsp,
          total_deposit: 0,
          total_withdraw: 0,
          company_net_win: 0,
          registered_members: 0,
          deposit_member_count: 0,
          members_withdrawn: 0,
          effective_member: 0,
          first_deposit_count: 0,
        }
      }
      const s = storeMap[row.sub_affiliate]
      s.total_deposit += row.total_deposit
      s.total_withdraw += row.total_withdraw
      s.company_net_win += row.company_net_win
      s.registered_members += row.registered_members
      s.deposit_member_count += row.deposit_member_count
      s.members_withdrawn += row.members_withdrawn
      s.effective_member += row.effective_member
      s.first_deposit_count += row.first_deposit_count
    }

    const stores = Object.values(storeMap)
```

Replace it with:

```ts
    // Aggregate by store (sum across periods if multiple)
    const storeMap: Record<string, any> = {}
    for (const row of data || []) {
      if (!storeMap[row.sub_affiliate]) {
        storeMap[row.sub_affiliate] = {
          sub_affiliate: row.sub_affiliate,
          store_name: row.store_name,
          partner: row.partner,
          dsp: row.dsp,
          total_deposit: 0,
          total_withdraw: 0,
          valid_bet_amount: 0,
          company_net_win: 0,
          payout_amount: 0,
          registered_members: 0,
          deposit_member_count: 0,
          members_withdrawn: 0,
          effective_member: 0,
          first_deposit_count: 0,
        }
      }
      const s = storeMap[row.sub_affiliate]
      s.total_deposit += row.total_deposit
      s.total_withdraw += row.total_withdraw
      s.valid_bet_amount += row.valid_bet_amount
      s.company_net_win += row.company_net_win
      s.payout_amount += row.payout_amount
      s.registered_members += row.registered_members
      s.deposit_member_count += row.deposit_member_count
      s.members_withdrawn += row.members_withdrawn
      s.effective_member += row.effective_member
      s.first_deposit_count += row.first_deposit_count
    }

    const stores = Object.values(storeMap)
    const allStores = [...stores].sort((a: any, b: any) => b.total_deposit - a.total_deposit)
```

- [ ] **Step 2: Return `allStores` in the JSON response**

Find this line in `app/api/performance/route.ts`:

```ts
    return NextResponse.json({ top20Stores, top20DSPs, periods: uniquePeriods, overallTotals })
```

Replace it with:

```ts
    return NextResponse.json({ top20Stores, top20DSPs, periods: uniquePeriods, overallTotals, allStores })
```

- [ ] **Step 3: Verify manually with curl**

With `npm run dev` running:

```bash
curl -s "http://localhost:3000/api/performance" | head -c 2000
```

Expected: valid JSON containing an `allStores` array. Each item should have `valid_bet_amount` and `payout_amount` as numbers (not `undefined`), and the array should be sorted with the highest `total_deposit` first. If there's existing uploaded data, spot-check that a store appearing in two different periods shows one entry with summed totals (cross-check against `curl "http://localhost:3000/api/export"` for that `sub_affiliate`).

```bash
curl -s "http://localhost:3000/api/performance" | grep -o '"top20Stores":\[' | head -1
```

Expected: still present and non-empty when data exists — confirms `top20Stores` wasn't broken by this change.

- [ ] **Step 4: Commit**

```bash
git add app/api/performance/route.ts
git commit -m "Add valid_bet_amount/payout_amount sums and allStores to /api/performance"
```

---

### Task 2: Render the Store Summary table on the SSS Data page

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Consumes: `GET /api/performance` response field `allStores` (from Task 1).
- Produces: none new — final consumer in this plan.

- [ ] **Step 1: Add the `StoreRow` type**

Find this block in `app/sss-data/page.tsx`:

```ts
type OverallTotals = {
  total_deposit: number
  total_withdraw: number
  company_net_win: number
  registered_members: number
  deposit_member_count: number
  effective_member: number
  store_count: number
}
```

Replace it with:

```ts
type OverallTotals = {
  total_deposit: number
  total_withdraw: number
  company_net_win: number
  registered_members: number
  deposit_member_count: number
  effective_member: number
  store_count: number
}

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

- [ ] **Step 2: Add `allStores` state and populate it in `fetchOverall`**

Find this block in `app/sss-data/page.tsx`:

```ts
  const [overallFrom, setOverallFrom] = useState('')
  const [overallTo, setOverallTo] = useState('')
  const [overallTotals, setOverallTotals] = useState<OverallTotals | null>(null)
  const [overallLoading, setOverallLoading] = useState(false)
  const [overallError, setOverallError] = useState<string | null>(null)

  const fetchOverall = async (from: string, to: string) => {
    setOverallLoading(true)
    setOverallError(null)
    try {
      const query = from && to ? `?from=${from}&to=${to}` : ''
      const res = await fetch(`/api/performance${query}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOverallTotals(data.overallTotals)
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

- [ ] **Step 3: Add the Store Summary table below the Overall card**

Find this block in `app/sss-data/page.tsx`:

```tsx
        {!overallLoading && !overallError && (overallTotals?.store_count || 0) === 0 && (
          <p className="text-xs text-gray-400 mt-3">No data yet — upload a CSV below.</p>
        )}
      </div>

      {/* Column warnings */}
```

Replace it with:

```tsx
        {!overallLoading && !overallError && (overallTotals?.store_count || 0) === 0 && (
          <p className="text-xs text-gray-400 mt-3">No data yet — upload a CSV below.</p>
        )}
      </div>

      {/* Store Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-700 mb-3">Store Summary</h2>
        {!overallLoading && !overallError && allStores.length === 0 && (
          <p className="text-xs text-gray-400">No data yet — upload a CSV below.</p>
        )}
        {allStores.length > 0 && (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-gray-50">
                  {['Partner', 'DSP', 'Sub Affiliate', 'Sub Affiliate Name', 'Total Deposit', 'Total Withdraw', 'Valid Bet Amount', 'Company Net Win (GGR)', 'Payout Amount', 'Registered Members'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allStores.map((s) => (
                  <tr key={s.sub_affiliate} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{s.partner || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{s.dsp || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{s.sub_affiliate}</td>
                    <td className="px-3 py-2 text-gray-700">{s.store_name}</td>
                    <td className="px-3 py-2 text-gray-700">{fmt(s.total_deposit)}</td>
                    <td className="px-3 py-2 text-gray-700">{fmt(s.total_withdraw)}</td>
                    <td className="px-3 py-2 text-gray-700">{fmt(s.valid_bet_amount)}</td>
                    <td className={`px-3 py-2 font-medium ${s.company_net_win >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(s.company_net_win)}</td>
                    <td className="px-3 py-2 text-gray-700">{fmt(s.payout_amount)}</td>
                    <td className="px-3 py-2 text-gray-700">{s.registered_members.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Column warnings */}
```

- [ ] **Step 4: Verify manually**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, reload `http://localhost:3000/sss-data`. Expected: a "Store Summary" card below "Overall" with 10 columns (Partner, DSP, Sub Affiliate, Sub Affiliate Name, Total Deposit, Total Withdraw, Valid Bet Amount, Company Net Win (GGR), Payout Amount, Registered Members), one row per store, sorted by Total Deposit descending. If a store has no DSP, that cell shows "—" rather than breaking the layout. Change the From/To date inputs and confirm the table's rows update along with the Overall card. With no data uploaded for the selected range, confirm the table shows "No data yet — upload a CSV below." instead of an empty table.

- [ ] **Step 5: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Add Store Summary table to SSS Data page"
```
