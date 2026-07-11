# Dashboard Partner Charts — Design

## Background

The Relevanttech partner sends a daily dashboard screenshot to management. Today, a
person manually reads 6 numbers off that screenshot, computes 3 derived metrics by
hand, appends a row to a running spreadsheet-style table, and regenerates a static
Chart.js HTML file — every single day, in a separate Claude chat.

This feature replaces that manual loop by computing and rendering the same charts
natively inside SSS Intelligence, sourced from the SSS data already uploaded through
the existing `/sss-data` upload flow (daily uploads exist today for both Alpharus and
Relevant Tech).

## Field Mapping

The boss's dashboard fields map onto the existing `performance_data` columns as follows
(confirmed with the user — no schema changes needed):

| Boss's field | `performance_data` column |
|---|---|
| Registered Members | `registered_members` |
| First Deposit Members | `first_deposit_count` |
| Depositing Members | `deposit_member_count` |
| Member Count (used in 7-Day Retention) | `registered_members` (same field, reused) |
| Total Deposits (PHP) | `total_deposit` |
| Active Member | `effective_member` (no separate "active member" field exists; this is the closest analog and is what the CSV upload already captures as "Effective Member") |

Chart labels will say "Effective Member," not "Active Member," since that's the real
underlying field — no point mislabeling data we don't actually have.

## Chart Definitions

All four charts below cover a rolling **14-day window** (last week + this week), same
line-chart style as the boss's rolling-30-day original, just a shorter window. All
values are **partner-level totals** — summed across every store belonging to that
partner for a given day — not per-store.

**Dual-axis deviation from the boss's original:** the boss's dashboard plots PHP
amounts on a right axis alongside percentages/counts on a left axis, on the same
chart. The dataviz skill flags dual-axis (two y-scales on one chart) as the most
common charting mistake — it makes the visual comparison between lines misleading,
since a viewer can't tell which scale a line belongs to at a glance. Per the user's
explicit choice, this design splits each of the boss's 2 dual-axis charts into 2
single-axis charts each (4 charts total), grouping only same-scale metrics together:

### Chart 1a — Efficiency & Retention (line chart, % axis)
- **Conversion Rate (%)** = `first_deposit_count / registered_members × 100`
  Blank for a day if `registered_members = 0` (per boss's own rule).
- **7-Day Retention (%)** = `registered_members(day) / sum(registered_members, trailing 7 days incl. that day) × 100`
  Values over 100% are valid and expected (means retained users outnumber new
  registrations that week) — not an error state, don't clamp or flag it.

### Chart 1b — Avg Deposit/Member (line chart, PHP axis)
- **Avg Deposit/Member (PHP)** = `total_deposit / deposit_member_count`
  Blank for a day if `deposit_member_count = 0`.

### Chart 2a — Members (line chart, count axis)
- **Registered Members**
- **Effective Member**

### Chart 2b — Total Deposits (line chart, PHP axis)
- **Total Deposits (PHP)**

### Per-Store Breakdown Table
Below the two charts: one row per store belonging to the selected partner, aggregated
over the same 14-day window. Columns: Store Name, Registered Members, Effective
Member, Total Deposit. Sorted by Total Deposit descending (matches existing table
conventions elsewhere in the app).

## Data Flow

**New endpoint:** `GET /api/dashboard-charts?partner=<Alpharus|Relevant Tech>`

1. Query `performance_data` where `partner = <partner>` and `period_type = 'daily'`,
   for the last **~21 days** (14-day display window + 7-day lookback buffer so the
   7-Day Retention rolling sum is correct on every displayed day, including the first).
2. Group rows by `period` (the date string) and sum each metric across all stores for
   that day.
3. A day with zero rows for that partner (no upload happened) is a gap — it does not
   appear as a zero-value point on the line.
4. Compute the 3 derived metrics per day per the formulas above; a metric is `null`
   for a day if its denominator is 0, which renders as a gap in that line only (other
   lines on the same chart are unaffected).
5. Trim the response to the last 14 days for the chart series, but keep using the
   full ~21-day fetch for the retention rolling-sum math.
6. Separately, aggregate the same ~14-day window by `sub_affiliate` (store) for the
   breakdown table.
7. Return `{ series: [...], storeBreakdown: [...] }`.

No caching layer — this always reads live from `performance_data`, so a fresh upload
is reflected the next time `/dashboard` loads. No cron job, no webhook, no manual
regeneration step.

## UI Changes

**Location:** New section on `app/(app)/dashboard/page.tsx`, placed after the existing
"Combined" and per-partner stat cards, above "Top 50 Members." Layout: a 2x2 grid of
the 4 charts (Chart 1a, 1b, 2a, 2b), stacking to a single column on mobile per this
app's existing responsive conventions.

**Controls:** A dropdown (native `<select>`, matching the existing period-filter
pattern in `PerformancePage.tsx`) with options Alpharus / Relevant Tech. Changing it
refetches `/api/dashboard-charts` for the new partner and re-renders both charts and
the store table.

**Charting library:** `recharts` — new dependency. Chosen over raw Chart.js because
this is a React app; recharts components map directly to JSX without manual
canvas/lifecycle management, which is a cleaner fit here than the boss's original
static-HTML Chart.js approach. Colors/styling will match this app's existing
dashboard card conventions (white/dark-mode card containers, Tailwind spacing as
used elsewhere on `/dashboard`).

**Loading/empty states:** While fetching, show the same `"Loading..."` pattern used
elsewhere on this page. If a partner has fewer than 14 days of daily history, the
chart simply renders however many days exist — no special empty state needed unless
there are zero days, in which case show "No daily data yet for this partner."

## Out of Scope

- No changes to the upload template or `performance_data` schema — both are reused
  as-is.
- No true "Active Member" or "Member Count" fields are added; both are accepted as
  reusing existing columns per the user's explicit direction.
- No per-store drill-down charts — only the aggregate 14-day trend charts, plus the
  flat breakdown table.
- No historical backfill logic beyond what's already in the database.
