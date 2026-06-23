# SSS Data Page: From/To Date Range Filter

## Problem

The SSS Data page's Overall summary and Export button currently filter by a single
exact `period` value (or "All Time"), via a dropdown populated from existing periods.
Claire wants a from/to date range instead, so she can see totals and export data across
an arbitrary span rather than only one exact period or everything.

## Goals

- Replace the single period dropdown on the SSS Data page with two date inputs (From,
  To) that filter both the Overall summary card and the Export download.
- Reuse the `from`/`to` range-filter logic that already exists in
  `app/api/performance/route.ts` but is currently unused by any caller.
- Add the same `from`/`to` support to `app/api/export/route.ts`.

## Non-goals

- The Performance page's own period dropdown (`app/performance/page.tsx` +
  `app/api/performance/route.ts`'s `?period=<exact>` path) is untouched — it is a
  separate page/component with its own filter, unrelated to this change.
- Normalizing monthly periods (`"2026-02"`) to a true calendar-month date range for
  comparison purposes. **Known, accepted limitation:** because `performance_data.period`
  is filtered with plain string comparison (`.gte()` / `.lte()`), a date range that
  spans from a monthly period into a daily period (e.g. "Feb 1 to June 30", where
  Feb-May are monthly strings like `"2026-02"` and June+ are daily strings like
  `"2026-06-23"`) can mis-include or mis-exclude the boundary month, because
  `"2026-02"` sorts as less than `"2026-02-01"` in plain string comparison. Claire has
  confirmed this is acceptable — she'll mostly filter within one granularity at a time.
- No "All Time" reset button — leaving both date fields empty means All Time.
- No validation of an inverted range (From after To) — it simply returns zero rows,
  which renders as the page's existing "No data yet" empty state.

## Design

### Data flow

- `app/api/performance/route.ts` already has this branch (unchanged, just newly used):
  ```ts
  if (period && period !== 'all') {
    query = query.eq('period', period)
  } else if (fromPeriod && toPeriod) {
    query = query.gte('period', fromPeriod).lte('period', toPeriod)
  }
  ```
- `app/api/export/route.ts` gets the equivalent branch added, alongside its existing
  `period=all|<period>` handling (kept for backward compatibility, just no longer
  called by the SSS Data page):
  ```ts
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (period && period !== 'all') {
    query = query.eq('period', period)
  } else if (from && to) {
    query = query.gte('period', from).lte('period', to)
  }
  ```
- On the SSS Data page, `overallPeriod` and `overallPeriods` (the dropdown's state and
  its options list) are removed. Two new state variables, `overallFrom` and
  `overallTo` (strings, default `''`), replace them.
- `fetchOverall(from: string, to: string)` builds the query string conditionally:
  `from && to` → `/api/performance?from=${from}&to=${to}`; otherwise →
  `/api/performance` with no query params (the route's existing all-time fallback).
- `handleExport` builds its URL the same way against `/api/export`.
- Both date inputs' `onChange` call `fetchOverall` with the current pair of values.

### UI layout

- The period `<select>` in the SSS Data page header is replaced with two
  `<input type="date">` elements, labeled "From" and "To", placed immediately before
  the existing Export and Import buttons.
- Both fields are empty on initial page load, so the Overall card shows All Time totals
  by default (matching today's behavior).
- Changing either date re-fetches the Overall card's totals using both current values.

### Error handling

- Unchanged from the existing pattern: a failed `/api/performance` or `/api/export`
  call sets `overallError`, rendered via the existing inline red banner. No new
  error-handling logic is introduced.

## Testing

- Manual verification in the browser (per project convention — no test suite exists in
  this repo): load the page and confirm All Time totals show with both date fields
  empty; pick a From/To range covering known uploaded data and confirm the Overall
  card's totals update to match; click Export with a range selected and confirm the
  downloaded CSV only contains rows within that range; clear both fields and confirm
  the card and a fresh export both return to All Time totals.
