# SSS Data From/To Date Range Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SSS Data page's single-period dropdown with two date inputs (From, To) that filter both the Overall summary card and the Export download by date range.

**Architecture:** `app/api/performance/route.ts` already supports `from`/`to` range filtering (`.gte('period', from).lte('period', to)`) — that code path exists today but nothing calls it yet. Add the equivalent `from`/`to` branch to `app/api/export/route.ts`, then swap the SSS Data page's period `<select>` for two `<input type="date">` elements wired to both endpoints.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, Tailwind CSS (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually against `npm run dev` (API routes via `curl`, UI via browser/tsc).
- Plain string comparison (`.gte()`/`.lte()` on the `period` text column) is the accepted filtering method — do not add date-range normalization logic for mixed monthly/daily period formats. This is a known, accepted limitation (see spec's Non-goals).
- The Performance page (`app/performance/page.tsx`, and the `?period=<exact>` path in `app/api/performance/route.ts`) is untouched — it has its own separate period dropdown and must keep working exactly as it does today.
- No "All Time" reset button — empty From/To fields already mean All Time (no query params sent).
- `app/api/export/route.ts`'s existing `period=all|<period>` handling must remain (for backward compatibility), with `from`/`to` added alongside it, not replacing it.

---

### Task 1: Add `from`/`to` range filtering to `/api/export`

**Files:**
- Modify: `app/api/export/route.ts`

**Interfaces:**
- Produces: `GET /api/export?from=<period>&to=<period>` now filters with `.gte('period', from).lte('period', to)`, mirroring `/api/performance`'s existing behavior. `GET /api/export?period=all|<period>` keeps working exactly as before. `GET /api/export` with no params returns all rows (unchanged). Task 2 consumes this.

- [ ] **Step 1: Add `from`/`to` parsing and the range-filter branch**

Find this block in `app/api/export/route.ts`:

```ts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')

    let query = supabase.from('performance_data').select('*').order('period', { ascending: false })
    if (period && period !== 'all') {
      query = query.eq('period', period)
    }
```

Replace it with:

```ts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    let query = supabase.from('performance_data').select('*').order('period', { ascending: false })
    if (period && period !== 'all') {
      query = query.eq('period', period)
    } else if (from && to) {
      query = query.gte('period', from).lte('period', to)
    }
```

- [ ] **Step 2: Verify manually with curl**

With `npm run dev` running:

```bash
curl -s "http://localhost:3000/api/export?from=2026-02&to=2026-05" | head -5
```

Expected: CSV header row, followed by only rows whose `period` falls between `2026-02` and `2026-05` inclusive (or just the header if no such rows exist yet — not an error).

```bash
curl -s "http://localhost:3000/api/export?period=all" | head -1
curl -s "http://localhost:3000/api/export" | head -1
```

Expected: both still return the CSV header row — confirms the pre-existing `period=all` and no-params behavior are unaffected.

- [ ] **Step 3: Commit**

```bash
git add app/api/export/route.ts
git commit -m "Add from/to range filtering to /api/export"
```

---

### Task 2: Replace period dropdown with From/To date inputs on SSS Data page

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Consumes: `GET /api/performance?from=<period>&to=<period>` (existing, unchanged) and `GET /api/export?from=<period>&to=<period>` (from Task 1).
- Produces: none new — this is the final consumer in this plan.

- [ ] **Step 1: Replace the period/dropdown state and fetch logic with From/To state**

Find this block in `app/sss-data/page.tsx`:

```tsx
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

Replace it with:

```tsx
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

  useEffect(() => { fetchOverall('', '') }, [])

  const handleOverallFromChange = (value: string) => {
    setOverallFrom(value)
    fetchOverall(value, overallTo)
  }

  const handleOverallToChange = (value: string) => {
    setOverallTo(value)
    fetchOverall(overallFrom, value)
  }

  const handleExport = async () => {
    setOverallError(null)
    try {
      const query = overallFrom && overallTo ? `?from=${overallFrom}&to=${overallTo}` : ''
      const res = await fetch(`/api/export${query}`)
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

- [ ] **Step 2: Replace the header's period `<select>` with two date inputs**

Find this block:

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
```

Replace it with:

```tsx
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={overallFrom}
            onChange={(e) => handleOverallFromChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={overallTo}
            onChange={(e) => handleOverallToChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
          />
          <button
            onClick={handleExport}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg shadow-sm transition-colors text-sm whitespace-nowrap"
          >
            ⬇️ Export
          </button>
        </div>
```

- [ ] **Step 3: Verify manually**

Run `npx tsc --noEmit` — expect zero errors (confirms no leftover references to the removed `overallPeriod`/`overallPeriods`/`handleOverallPeriodChange`).

With `npm run dev` running, reload `http://localhost:3000/sss-data`. Expected: two date inputs ("From", "to" label, "To") replace the old dropdown, both empty on load, Overall card shows All Time totals. Pick a From and To date — the Overall card's numbers update. Click Export with a range selected — confirm (via the Network tab or by inspecting the downloaded file) that the request hits `/api/export?from=...&to=...` and the CSV only contains matching rows. Clear both date fields and confirm the card returns to All Time totals.

- [ ] **Step 4: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Replace period dropdown with From/To date range filter on SSS Data page"
```
