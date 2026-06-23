# Performance Four Top-20 Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Performance page's 2 leaderboards with 4: Top 20 Stores by Deposit (Score/Status removed), Top 20 Stores by Registered Members (new), Top 20 DSPs by Store Count (unchanged), Top 20 DSPs by Deposit (new).

**Architecture:** `app/api/performance/route.ts` drops its weighted score calculation entirely and adds two new sorted slices of data it already aggregates (`stores`, `dspMap`) — no new aggregation logic, just different sorts. `app/performance/page.tsx` renders 4 cards instead of 2, reading 4 arrays from the same single fetch it already makes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, Tailwind CSS (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually (curl for the API, browser/tsc for the UI).
- All 4 lists continue to respect the existing period filter (`?period=all` or a specific period) — no change to that filtering logic.
- `/api/performance`'s other fields (`overallTotals`, `allStores`, `lastUpdated`) used by the SSS Data page are untouched.
- Stores stay deduplicated by `sub_affiliate`; DSPs stay grouped by `dsp__partner` — only sort order and which fields are exposed change.

---

### Task 1: Remove score calculation, add `top20StoresByMembers` and `top20DSPsByDeposit`

**Files:**
- Modify: `app/api/performance/route.ts`

**Interfaces:**
- Produces: the route's JSON response loses the `score`/`label` fields on `top20Stores` items, and gains two new fields: `top20StoresByMembers` (same shape as `top20Stores`, sorted by `registered_members` descending, sliced to 20) and `top20DSPsByDeposit` (same shape as `top20DSPs`, sorted by `total_deposit` descending, sliced to 20). Task 2 consumes both new fields by name.

- [ ] **Step 1: Remove the score calculation and add `top20StoresByMembers`**

Find this block in `app/api/performance/route.ts`:

```ts
    const maxDeposit = Math.max(...stores.map((s: any) => s.total_deposit), 1)

    // Calculate score & sort
    const storesWithScore = stores.map((s: any) => {
      const depositScore = (s.total_deposit / maxDeposit) * 100
      const activationRate = s.registered_members > 0
        ? (s.deposit_member_count / s.registered_members) * 100 : 0
      const ggrMargin = s.total_deposit > 0
        ? Math.min(Math.max((s.company_net_win / s.total_deposit) * 100, 0), 100) : 0
      const retention = s.deposit_member_count > 0
        ? Math.max((1 - s.members_withdrawn / s.deposit_member_count) * 100, 0) : 0
      const score = (depositScore * 0.35) + (activationRate * 0.30) + (ggrMargin * 0.25) + (retention * 0.10)
      const label = score >= 80 ? 'Scale' : score >= 50 ? 'Maintain' : 'Fix'
      return { ...s, score: Math.round(score), label }
    })

    const top20Stores = storesWithScore
      .sort((a: any, b: any) => b.total_deposit - a.total_deposit)
      .slice(0, 20)
```

Replace it with:

```ts
    const top20Stores = [...stores]
      .sort((a: any, b: any) => b.total_deposit - a.total_deposit)
      .slice(0, 20)

    const top20StoresByMembers = [...stores]
      .sort((a: any, b: any) => b.registered_members - a.registered_members)
      .slice(0, 20)
```

- [ ] **Step 2: Add `top20DSPsByDeposit`**

Find this block in `app/api/performance/route.ts`:

```ts
    const top20DSPs = Object.values(dspMap)
      .sort((a: any, b: any) => b.store_count - a.store_count)
      .slice(0, 20)
```

Replace it with:

```ts
    const top20DSPs = Object.values(dspMap)
      .sort((a: any, b: any) => b.store_count - a.store_count)
      .slice(0, 20)

    const top20DSPsByDeposit = Object.values(dspMap)
      .sort((a: any, b: any) => (b as any).total_deposit - (a as any).total_deposit)
      .slice(0, 20)
```

- [ ] **Step 3: Return the two new fields**

Find this line in `app/api/performance/route.ts`:

```ts
    return NextResponse.json({ top20Stores, top20DSPs, periods: uniquePeriods, overallTotals, allStores, lastUpdated })
```

Replace it with:

```ts
    return NextResponse.json({ top20Stores, top20StoresByMembers, top20DSPs, top20DSPsByDeposit, periods: uniquePeriods, overallTotals, allStores, lastUpdated })
```

- [ ] **Step 4: Verify manually with curl**

With `npm run dev` running:

```bash
curl -s "http://localhost:3000/api/performance" | grep -o '"score"' | head -1
```

Expected: no output — confirms `score` no longer appears anywhere in the response.

```bash
curl -s "http://localhost:3000/api/performance" | grep -o '"top20StoresByMembers":\[[^]]\{0,200\}'
curl -s "http://localhost:3000/api/performance" | grep -o '"top20DSPsByDeposit":\[[^]]\{0,200\}'
```

Expected: both present, non-empty if data exists. Spot-check that `top20StoresByMembers`'s first entry has the highest `registered_members` among the visible items, and `top20DSPsByDeposit`'s first entry has the highest `total_deposit`.

- [ ] **Step 5: Commit**

```bash
git add app/api/performance/route.ts
git commit -m "Remove score calculation, add top20StoresByMembers and top20DSPsByDeposit"
```

---

### Task 2: Render four Top 20 sections on the Performance page

**Files:**
- Modify: `app/performance/page.tsx`

**Interfaces:**
- Consumes: `GET /api/performance` response fields `top20Stores` (now without `score`/`label`), `top20StoresByMembers`, `top20DSPs`, `top20DSPsByDeposit` (from Task 1).
- Produces: none new — final consumer in this plan.

- [ ] **Step 1: Update types and state, remove `labelColor`, fetch all 4 lists**

Find this block in `app/performance/page.tsx`:

```tsx
type StoreRow = {
  sub_affiliate: string
  store_name: string
  partner: string
  dsp: string
  total_deposit: number
  company_net_win: number
  effective_member: number
  score: number
  label: string
}

type DSPRow = {
  dsp: string
  partner: string
  store_count: number
  total_deposit: number
  total_grr: number
}

const labelColor = (l: string) =>
  l === 'Scale' ? 'bg-green-100 text-green-700' : l === 'Maintain' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PerformancePage() {
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [stores, setStores] = useState<StoreRow[]>([])
  const [dsps, setDSPs] = useState<DSPRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async (period: string) => {
    setLoading(true)
    const res = await fetch(`/api/performance?period=${period}`)
    const data = await res.json()
    setStores(data.top20Stores || [])
    setDSPs(data.top20DSPs || [])
    if (data.periods) setPeriods(data.periods)
    setLoading(false)
  }
```

Replace it with:

```tsx
type StoreRow = {
  sub_affiliate: string
  store_name: string
  partner: string
  dsp: string
  total_deposit: number
  company_net_win: number
  effective_member: number
  registered_members: number
}

type DSPRow = {
  dsp: string
  partner: string
  store_count: number
  total_deposit: number
  total_grr: number
}

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PerformancePage() {
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storesByMembers, setStoresByMembers] = useState<StoreRow[]>([])
  const [dsps, setDSPs] = useState<DSPRow[]>([])
  const [dspsByDeposit, setDSPsByDeposit] = useState<DSPRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async (period: string) => {
    setLoading(true)
    const res = await fetch(`/api/performance?period=${period}`)
    const data = await res.json()
    setStores(data.top20Stores || [])
    setStoresByMembers(data.top20StoresByMembers || [])
    setDSPs(data.top20DSPs || [])
    setDSPsByDeposit(data.top20DSPsByDeposit || [])
    if (data.periods) setPeriods(data.periods)
    setLoading(false)
  }
```

- [ ] **Step 2: Remove Score/Status columns from the Stores by Deposit table and add the Stores by Registered Members section**

Find this block in `app/performance/page.tsx`:

```tsx
          {/* Top 20 Stores */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">🏆 Top 20 Stores by Deposit</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Store</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">DSP</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">GGR</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-center">Score</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s, i) => (
                    <tr key={s.sub_affiliate} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{s.store_name}</div>
                        <div className="text-xs text-gray-400">{s.sub_affiliate}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.dsp || '—'}</td>
                      <td className="px-4 py-3">
                        {s.partner ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{s.partner}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(s.total_deposit)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${s.company_net_win >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmt(s.company_net_win)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-gray-700">{s.score}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${labelColor(s.label)}`}>{s.label}</span>
                      </td>
                    </tr>
                  ))}
                  {stores.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 20 DSPs */}
```

Replace it with:

```tsx
          {/* Top 20 Stores */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">🏆 Top 20 Stores by Deposit</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Store</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">DSP</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">GGR</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s, i) => (
                    <tr key={s.sub_affiliate} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{s.store_name}</div>
                        <div className="text-xs text-gray-400">{s.sub_affiliate}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.dsp || '—'}</td>
                      <td className="px-4 py-3">
                        {s.partner ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{s.partner}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(s.total_deposit)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${s.company_net_win >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmt(s.company_net_win)}
                      </td>
                    </tr>
                  ))}
                  {stores.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 20 Stores by Registered Members */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">⭐ Top 20 Stores by Registered Members</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Store</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">DSP</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Registered Members</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {storesByMembers.map((s, i) => (
                    <tr key={s.sub_affiliate} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{s.store_name}</div>
                        <div className="text-xs text-gray-400">{s.sub_affiliate}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.dsp || '—'}</td>
                      <td className="px-4 py-3">
                        {s.partner ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{s.partner}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-700">{s.registered_members.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(s.total_deposit)}</td>
                    </tr>
                  ))}
                  {storesByMembers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 20 DSPs */}
```

- [ ] **Step 3: Add the DSPs by Deposit section**

Find this block in `app/performance/page.tsx`:

```tsx
                  {dsps.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

Replace it with:

```tsx
                  {dsps.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 20 DSPs by Deposit */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">💰 Top 20 DSPs by Deposit</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">DSP</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-center">Stores</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total GGR</th>
                  </tr>
                </thead>
                <tbody>
                  {dspsByDeposit.map((d, i) => (
                    <tr key={`${d.dsp}-${d.partner}`} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{d.dsp}</td>
                      <td className="px-4 py-3">
                        {d.partner ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{d.partner}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-gray-700">{d.store_count}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(d.total_deposit)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${d.total_grr >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(d.total_grr)}</td>
                    </tr>
                  ))}
                  {dspsByDeposit.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify manually**

Run `npx tsc --noEmit` — expect zero errors (confirms no leftover references to `labelColor`, `score`, or `label`).

With `npm run dev` running, reload `http://localhost:3000/performance`. Expected: four cards in order — Top 20 Stores by Deposit (no Score/Status columns), Top 20 Stores by Registered Members, Top 20 DSPs by Store Count, Top 20 DSPs by Deposit. Confirm the Registered Members list is sorted highest-first, and the DSPs by Deposit list is sorted highest-first by Total Deposit (and differs in order from the DSPs by Store Count list, unless they happen to coincide). Change the period filter and confirm all four update together.

- [ ] **Step 5: Commit**

```bash
git add app/performance/page.tsx
git commit -m "Render four Top 20 sections on the Performance page"
```
