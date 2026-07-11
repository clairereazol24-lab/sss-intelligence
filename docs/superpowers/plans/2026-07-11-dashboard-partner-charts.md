# Dashboard Partner Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual daily screenshot-to-Claude workflow with native, auto-updating Alpharus/Relevant Tech performance charts on the SSS Intelligence dashboard.

**Architecture:** One new API route aggregates `performance_data` rows into a 14-day daily series (plus a 7-day lookback buffer for retention math) and a per-store breakdown, both scoped to a `partner` query param. Four small Recharts line-chart components render that series (split into single-axis charts, not the boss's original dual-axis layout). A container component owns the partner dropdown, the fetch, and composes the four charts plus a breakdown table. The dashboard page renders that container in a new section.

**Tech Stack:** Next.js 14 (App Router), Supabase (`performance_data` table), `recharts` (new dependency), Tailwind CSS, existing `useTheme()` hook from `components/ThemeProvider.tsx`.

## Global Constraints

- No test framework exists in this repo (no vitest/jest, `package.json` has no `test` script). Every task's verification step is manual: exercise the code via `curl`/dev server/browser, then run `npm run build` to catch type errors. Do not add a test framework as part of this feature — out of scope.
- Always run `npm run build` before considering a task's frontend/API changes done — this repo has a history of Vercel build failures from TypeScript errors slipping through.
- Dual-axis charts (two y-scales on one chart) are disallowed per the approved spec revision. Build 4 single-axis charts, not 2 dual-axis ones.
- Categorical color order is fixed across both 2-series charts: series 1 = blue (`#2a78d6` light / `#3987e5` dark), series 2 = aqua (`#1baf7a` light / `#199e70` dark).
- Dark mode is read from the existing `useTheme()` hook (`components/ThemeProvider.tsx`, returns `{ theme: 'light' | 'dark' }`) — do not introduce `next-themes`, a media query, or a `MutationObserver`.
- "Active Member" is displayed and labeled as "Effective Member" (the real underlying field — see spec). "Member Count" in the 7-Day Retention formula reuses `registered_members`.
- Series data windows: 14-day display window, but the API fetches 21 days (14 + 7-day lookback) so the 7-Day Retention rolling sum is correct for every displayed day.
- A day with no uploaded row for a partner is a gap in the line (`connectNulls={false}` on every `<Line>`), never rendered as a zero.
- Full field/formula mapping and rationale: see `docs/superpowers/specs/2026-07-11-dashboard-partner-charts-design.md`.

---

### Task 1: Add recharts dependency

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `recharts` package available to import from any client component (`'use client'` required, since Recharts renders via browser APIs).

- [ ] **Step 1: Install the package**

Run: `npm install recharts`

Expected: `package.json` gains a `"recharts"` line under `"dependencies"` (whatever semver range `npm install` resolves to — no specific major version is required), and `package-lock.json` updates. No errors.

- [ ] **Step 2: Verify the install resolves**

Run: `node -e "console.log(require('recharts/package.json').version)"`

Expected: prints a version string (e.g. `2.12.7`) with no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add recharts dependency for dashboard partner charts"
```

---

### Task 2: Build the `/api/dashboard-charts` aggregation endpoint

**Files:**
- Create: `app/api/dashboard-charts/route.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/lib/supabase-admin` (same import used by `app/api/performance/route.ts` and `app/api/upload/route.ts`); the `performance_data` table columns `period` (VARCHAR, `YYYY-MM-DD` for daily rows), `period_type` (`'daily'` | `'monthly'`), `partner`, `sub_affiliate`, `store_name`, `registered_members`, `first_deposit_count`, `deposit_member_count`, `effective_member`, `total_deposit`.
- Produces: `GET /api/dashboard-charts?partner=<Alpharus|Relevant Tech>` returning
  ```ts
  {
    series: Array<{
      date: string                        // 'YYYY-MM-DD'
      registered_members: number | null   // null = no upload that day
      effective_member: number | null
      total_deposit: number | null
      conversion_rate: number | null       // percent, e.g. 44.4
      avg_deposit_per_member: number | null
      retention_7d: number | null          // percent, can exceed 100
    }>,                                    // exactly 14 entries, oldest first
    storeBreakdown: Array<{
      store_name: string
      registered_members: number
      effective_member: number
      total_deposit: number
    }>                                     // sorted by total_deposit desc
  }
  ```
  This exact shape is what Task 6 (`PartnerChartsSection.tsx`) fetches and passes down to every chart component and the breakdown table.

- [ ] **Step 1: Write the route file**

```ts
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

const DISPLAY_DAYS = 14
const RETENTION_LOOKBACK_DAYS = 7
const FETCH_DAYS = DISPLAY_DAYS + RETENTION_LOOKBACK_DAYS // 21

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return toDateString(d)
}

type DayRow = {
  period: string
  sub_affiliate: string
  store_name: string
  registered_members: number
  first_deposit_count: number
  deposit_member_count: number
  effective_member: number
  total_deposit: number
}

type DayTotals = {
  registered_members: number
  first_deposit_count: number
  deposit_member_count: number
  effective_member: number
  total_deposit: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const partner = searchParams.get('partner')
    if (!partner) {
      return NextResponse.json({ error: 'partner is required' }, { status: 400 })
    }

    const startDate = daysAgo(FETCH_DAYS - 1)
    const endDate = daysAgo(0)

    const { data, error } = await supabase
      .from('performance_data')
      .select('period, sub_affiliate, store_name, registered_members, first_deposit_count, deposit_member_count, effective_member, total_deposit')
      .eq('partner', partner)
      .eq('period_type', 'daily')
      .gte('period', startDate)
      .lte('period', endDate)

    if (error) throw error
    const rows = (data || []) as DayRow[]

    // Aggregate by day across every store for this partner
    const dayMap: Record<string, DayTotals> = {}
    for (const r of rows) {
      if (!dayMap[r.period]) {
        dayMap[r.period] = { registered_members: 0, first_deposit_count: 0, deposit_member_count: 0, effective_member: 0, total_deposit: 0 }
      }
      const d = dayMap[r.period]
      d.registered_members += r.registered_members || 0
      d.first_deposit_count += r.first_deposit_count || 0
      d.deposit_member_count += r.deposit_member_count || 0
      d.effective_member += r.effective_member || 0
      d.total_deposit += r.total_deposit || 0
    }

    const allDates: string[] = []
    for (let i = FETCH_DAYS - 1; i >= 0; i--) allDates.push(daysAgo(i))
    const earliestFetchedDate = allDates[0]
    const displayDates = allDates.slice(FETCH_DAYS - DISPLAY_DAYS)

    const registeredOn = (date: string) => dayMap[date]?.registered_members ?? 0

    const series = displayDates.map(date => {
      const day = dayMap[date]
      const hasData = !!day

      const conversion_rate = hasData && day.registered_members > 0
        ? (day.first_deposit_count / day.registered_members) * 100
        : null

      const avg_deposit_per_member = hasData && day.deposit_member_count > 0
        ? day.total_deposit / day.deposit_member_count
        : null

      const dateObj = new Date(date)
      const trailingStart = new Date(dateObj)
      trailingStart.setUTCDate(trailingStart.getUTCDate() - (RETENTION_LOOKBACK_DAYS - 1))
      const trailingStartStr = toDateString(trailingStart)

      let retention_7d: number | null = null
      if (hasData && trailingStartStr >= earliestFetchedDate) {
        let sum7 = 0
        for (let i = 0; i < RETENTION_LOOKBACK_DAYS; i++) {
          const dd = new Date(dateObj)
          dd.setUTCDate(dd.getUTCDate() - i)
          sum7 += registeredOn(toDateString(dd))
        }
        retention_7d = sum7 > 0 ? (day.registered_members / sum7) * 100 : null
      }

      return {
        date,
        registered_members: hasData ? day.registered_members : null,
        effective_member: hasData ? day.effective_member : null,
        total_deposit: hasData ? day.total_deposit : null,
        conversion_rate,
        avg_deposit_per_member,
        retention_7d,
      }
    })

    // Per-store breakdown over the 14-day display window only
    const storeMap: Record<string, { store_name: string; registered_members: number; effective_member: number; total_deposit: number }> = {}
    const displayStart = displayDates[0]
    for (const r of rows) {
      if (r.period < displayStart) continue
      if (!storeMap[r.sub_affiliate]) {
        storeMap[r.sub_affiliate] = { store_name: r.store_name, registered_members: 0, effective_member: 0, total_deposit: 0 }
      }
      const s = storeMap[r.sub_affiliate]
      s.registered_members += r.registered_members || 0
      s.effective_member += r.effective_member || 0
      s.total_deposit += r.total_deposit || 0
    }
    const storeBreakdown = Object.values(storeMap).sort((a, b) => b.total_deposit - a.total_deposit)

    return NextResponse.json({ series, storeBreakdown })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify against the dev server**

Run: `npm run dev` (leave running), then in a second terminal:
`curl "http://localhost:3000/api/dashboard-charts?partner=Alpharus"`

Expected: JSON with a `series` array of exactly 14 objects (check `.series | length` if you have `jq`: `curl -s "http://localhost:3000/api/dashboard-charts?partner=Alpharus" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).series.length))"` should print `14`), and a `storeBreakdown` array sorted descending by `total_deposit`. Repeat with `partner=Relevant%20Tech`.

- [ ] **Step 3: Verify the missing-partner error path**

Run: `curl -i "http://localhost:3000/api/dashboard-charts"`

Expected: HTTP 400 with `{"error":"partner is required"}`.

- [ ] **Step 4: Type-check**

Run: `npm run build`

Expected: build completes with no TypeScript errors in `app/api/dashboard-charts/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard-charts/route.ts
git commit -m "Add dashboard-charts API route: 14-day partner series + store breakdown"
```

---

### Task 3: Build the shared chart theme and the two "Efficiency" charts (1a, 1b)

**Files:**
- Create: `components/dashboard-charts/chartTheme.ts`
- Create: `components/dashboard-charts/EfficiencyRetentionChart.tsx` (Chart 1a)
- Create: `components/dashboard-charts/AvgDepositChart.tsx` (Chart 1b)

**Interfaces:**
- Consumes: `useTheme` from `@/components/ThemeProvider` (returns `{ theme: 'light' | 'dark' }`).
- Produces: `chartColors: { light: ChartPalette; dark: ChartPalette }` where `ChartPalette = { seriesBlue: string; seriesAqua: string; grid: string; axis: string; text: string }`, imported by every chart component in this task and Task 4.
- Produces: `fmtDate(d: string): string`, `fmtPct(v: number | null | undefined): string`, `fmtPhp(v: number | null | undefined): string`, `fmtCount(v: number | null | undefined): string` — shared formatters imported by every chart component in this task and Task 4, and by `StoreBreakdownTable` in Task 5 (for `fmtPhp`), instead of each file defining its own copy.
- Produces: `<EfficiencyRetentionChart data={SeriesPoint[]} />` and `<AvgDepositChart data={SeriesPoint[]} />`, where `SeriesPoint` is the exact shape returned by `/api/dashboard-charts`'s `series` array (Task 2) — both components only read the fields they need (`date`, `conversion_rate`, `retention_7d` for 1a; `date`, `avg_deposit_per_member` for 1b) and safely ignore the rest.

- [ ] **Step 1: Write the shared theme file**

```ts
export type ChartPalette = {
  seriesBlue: string
  seriesAqua: string
  grid: string
  axis: string
  text: string
  surface: string
}

export const chartColors: { light: ChartPalette; dark: ChartPalette } = {
  light: {
    seriesBlue: '#2a78d6',
    seriesAqua: '#1baf7a',
    grid: '#e1e0d9',
    axis: '#898781',
    text: '#52514e',
    surface: '#fcfcfb',
  },
  dark: {
    seriesBlue: '#3987e5',
    seriesAqua: '#199e70',
    grid: '#2c2c2a',
    axis: '#898781',
    text: '#c3c2b7',
    surface: '#1a1a19',
  },
}

export const fmtDate = (d: string): string => {
  const parts = d.split('-')
  return `${parts[1]}/${parts[2]}`
}

export const fmtPct = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : `${v.toFixed(1)}%`

export const fmtPhp = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtCount = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : v.toLocaleString('en-PH')
```

- [ ] **Step 2: Write Chart 1a (Conversion Rate + 7-Day Retention)**

```tsx
'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { chartColors, fmtDate, fmtPct } from './chartTheme'

type SeriesPoint = {
  date: string
  conversion_rate: number | null
  retention_7d: number | null
}

export default function EfficiencyRetentionChart({ data }: { data: SeriesPoint[] }) {
  const { theme } = useTheme()
  const c = chartColors[theme]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
      <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">Conversion Rate & 7-Day Retention (%)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: c.axis, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} />
          <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(value: number | null) => fmtPct(value)}
            contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.text, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: c.text }} />
          <Line type="monotone" dataKey="conversion_rate" name="Conversion Rate" stroke={c.seriesBlue} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
          <Line type="monotone" dataKey="retention_7d" name="7-Day Retention" stroke={c.seriesAqua} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Write Chart 1b (Avg Deposit/Member)**

```tsx
'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { chartColors, fmtDate, fmtPhp } from './chartTheme'

type SeriesPoint = {
  date: string
  avg_deposit_per_member: number | null
}

export default function AvgDepositChart({ data }: { data: SeriesPoint[] }) {
  const { theme } = useTheme()
  const c = chartColors[theme]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
      <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">Avg Deposit / Member (PHP)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: c.axis, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} />
          <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toLocaleString('en-PH')} />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(value: number | null) => fmtPhp(value)}
            contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.text, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="avg_deposit_per_member" name="Avg Deposit/Member" stroke={c.seriesBlue} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`

Expected: no TypeScript errors from the three new files. (The build will not yet render these components anywhere — that's expected until Task 6/7.)

- [ ] **Step 5: Commit**

```bash
git add components/dashboard-charts/chartTheme.ts components/dashboard-charts/EfficiencyRetentionChart.tsx components/dashboard-charts/AvgDepositChart.tsx
git commit -m "Add chart theme and the two Efficiency/Retention chart components"
```

---

### Task 4: Build the two "Pilot Performance" charts (2a, 2b)

**Files:**
- Create: `components/dashboard-charts/MembersChart.tsx` (Chart 2a)
- Create: `components/dashboard-charts/TotalDepositsChart.tsx` (Chart 2b)

**Interfaces:**
- Consumes: `chartColors`, `fmtDate`, `fmtCount`, `fmtPhp` from `./chartTheme` (Task 3), `useTheme` from `@/components/ThemeProvider`.
- Produces: `<MembersChart data={SeriesPoint[]} />` and `<TotalDepositsChart data={SeriesPoint[]} />`, same `SeriesPoint` shape as Task 2/3 (each reads only `date` + its own fields: `registered_members`/`effective_member` for 2a, `total_deposit` for 2b).

- [ ] **Step 1: Write Chart 2a (Registered Members + Effective Member)**

```tsx
'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { chartColors, fmtDate, fmtCount } from './chartTheme'

type SeriesPoint = {
  date: string
  registered_members: number | null
  effective_member: number | null
}

export default function MembersChart({ data }: { data: SeriesPoint[] }) {
  const { theme } = useTheme()
  const c = chartColors[theme]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
      <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">Registered Members & Effective Member</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: c.axis, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} />
          <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toLocaleString('en-PH')} />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(value: number | null) => fmtCount(value)}
            contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.text, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: c.text }} />
          <Line type="monotone" dataKey="registered_members" name="Registered Members" stroke={c.seriesBlue} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
          <Line type="monotone" dataKey="effective_member" name="Effective Member" stroke={c.seriesAqua} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Write Chart 2b (Total Deposits)**

```tsx
'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { chartColors, fmtDate, fmtPhp } from './chartTheme'

type SeriesPoint = {
  date: string
  total_deposit: number | null
}

export default function TotalDepositsChart({ data }: { data: SeriesPoint[] }) {
  const { theme } = useTheme()
  const c = chartColors[theme]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
      <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">Total Deposits (PHP)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: c.axis, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} />
          <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toLocaleString('en-PH')} />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(value: number | null) => fmtPhp(value)}
            contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.text, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="total_deposit" name="Total Deposits" stroke={c.seriesBlue} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`

Expected: no TypeScript errors from the two new files.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard-charts/MembersChart.tsx components/dashboard-charts/TotalDepositsChart.tsx
git commit -m "Add Members and Total Deposits chart components"
```

---

### Task 5: Build the store breakdown table

**Files:**
- Create: `components/dashboard-charts/StoreBreakdownTable.tsx`

**Interfaces:**
- Consumes: the exact `storeBreakdown` array shape from `/api/dashboard-charts` (Task 2): `Array<{ store_name: string; registered_members: number; effective_member: number; total_deposit: number }>`; `fmtPhp` from `./chartTheme` (Task 3).
- Produces: `<StoreBreakdownTable stores={StoreRow[]} />`.

- [ ] **Step 1: Write the component**

```tsx
'use client'
import { fmtPhp } from './chartTheme'

type StoreRow = {
  store_name: string
  registered_members: number
  effective_member: number
  total_deposit: number
}

export default function StoreBreakdownTable({ stores }: { stores: StoreRow[] }) {
  if (stores.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">No store data for this partner in the last 14 days.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700">
            <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Store</th>
            <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Registered Members</th>
            <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Effective Member</th>
            <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Total Deposit</th>
          </tr>
        </thead>
        <tbody>
          {stores.map(s => (
            <tr key={s.store_name} className="border-t border-gray-100 dark:border-gray-700">
              <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300 font-medium">{s.store_name}</td>
              <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{s.registered_members.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{s.effective_member.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{fmtPhp(s.total_deposit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`

Expected: no TypeScript errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard-charts/StoreBreakdownTable.tsx
git commit -m "Add per-store breakdown table for dashboard partner charts"
```

---

### Task 6: Build the container — dropdown, fetch, and composition

**Files:**
- Create: `components/dashboard-charts/PartnerChartsSection.tsx`

**Interfaces:**
- Consumes: `EfficiencyRetentionChart`, `AvgDepositChart` (Task 3); `MembersChart`, `TotalDepositsChart` (Task 4); `StoreBreakdownTable` (Task 5); fetches `GET /api/dashboard-charts?partner=<partner>` (Task 2).
- Produces: `<PartnerChartsSection />` (no props) — the single component Task 7 renders into the dashboard page.

- [ ] **Step 1: Write the component**

```tsx
'use client'
import { useEffect, useState } from 'react'
import EfficiencyRetentionChart from './EfficiencyRetentionChart'
import AvgDepositChart from './AvgDepositChart'
import MembersChart from './MembersChart'
import TotalDepositsChart from './TotalDepositsChart'
import StoreBreakdownTable from './StoreBreakdownTable'

const PARTNERS = ['Alpharus', 'Relevant Tech']

type SeriesPoint = {
  date: string
  registered_members: number | null
  effective_member: number | null
  total_deposit: number | null
  conversion_rate: number | null
  avg_deposit_per_member: number | null
  retention_7d: number | null
}

type StoreRow = {
  store_name: string
  registered_members: number
  effective_member: number
  total_deposit: number
}

export default function PartnerChartsSection() {
  const [partner, setPartner] = useState(PARTNERS[0])
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [storeBreakdown, setStoreBreakdown] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/dashboard-charts?partner=${encodeURIComponent(partner)}`)
      .then(async res => {
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load charts')
        return res.json()
      })
      .then(json => {
        if (cancelled) return
        setSeries(json.series || [])
        setStoreBreakdown(json.storeBreakdown || [])
      })
      .catch(err => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [partner])

  const hasAnyData = series.some(s => s.registered_members !== null)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200">Last Week & This Week</h2>
        <select
          value={partner}
          onChange={e => setPartner(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          {PARTNERS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-500 text-center py-8">{error}</p>
      ) : !hasAnyData ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No daily data yet for {partner}.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <EfficiencyRetentionChart data={series} />
            <AvgDepositChart data={series} />
            <MembersChart data={series} />
            <TotalDepositsChart data={series} />
          </div>
          <StoreBreakdownTable stores={storeBreakdown} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard-charts/PartnerChartsSection.tsx
git commit -m "Add PartnerChartsSection container: dropdown, fetch, and chart composition"
```

---

### Task 7: Wire the section into the dashboard page

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `PartnerChartsSection` (Task 6, default export, no props).

- [ ] **Step 1: Import the component**

At the top of `app/(app)/dashboard/page.tsx`, add this import alongside the existing `useState`/`useEffect` import:

```tsx
import PartnerChartsSection from '@/components/dashboard-charts/PartnerChartsSection'
```

- [ ] **Step 2: Render it between the per-partner cards and the Top 50 table**

Find this block (currently right before the `{/* Top 50 Members */}` comment):

```tsx
      {/* Top 50 Members */}
```

Replace it with:

```tsx
      <PartnerChartsSection />

      {/* Top 50 Members */}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "Render PartnerChartsSection on the dashboard page"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Load the dashboard in a browser**

Open `http://localhost:3000/dashboard`. Confirm:
- A new section titled "Last Week & This Week" appears above "Top 50 Members," with a partner dropdown defaulted to Alpharus.
- Four charts render: "Conversion Rate & 7-Day Retention (%)", "Avg Deposit / Member (PHP)", "Registered Members & Effective Member", "Total Deposits (PHP)".
- A store breakdown table renders below the charts with Store / Registered Members / Effective Member / Total Deposit columns.

- [ ] **Step 3: Switch partners**

Change the dropdown to "Relevant Tech". Confirm all four charts and the table update to that partner's data (loading state briefly shows, then new data renders).

- [ ] **Step 4: Confirm dark mode renders correctly**

Toggle dark mode (via this app's existing theme toggle). Confirm chart gridlines, axis labels, and line colors remain legible against the dark card background (no invisible-on-invisible text or lines).

- [ ] **Step 5: Confirm auto-update after a new upload**

Go to `/sss-data`, upload a new daily file for today's date for either partner (or use "Update File" mode on an existing day), then return to `/dashboard`. Confirm the charts reflect the new numbers without any manual step beyond reloading the page.

- [ ] **Step 6: Final build check**

Run: `npm run build`

Expected: build completes cleanly with zero TypeScript errors, confirming the whole feature is safe to push (per this project's "always run npm run build before pushing" convention).
