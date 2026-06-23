# SSS Data Page: Overall Summary + Import/Export Buttons

## Problem

The SSS Data page only offers a drag-and-drop CSV upload box. There is no way to see
running totals on this page (you have to go to the Performance page and pick "All Time"),
and there's no way to export the data that's been uploaded so far.

## Goals

- Show an "Overall" summary card on the SSS Data page with all-time totals across every
  upload, filterable by period.
- Replace the drag-and-drop upload box with a button-only "Import" control.
- Add an "Export" button that downloads the uploaded data as CSV, respecting the same
  period filter as the Overall summary.

## Non-goals

- Preventing double-counting when a user uploads both monthly and daily data covering
  the same date range (existing behavior, flagged separately, not addressed here).
- Changing the upload flow itself (column validation, period tagging for an upload,
  preview table, "Upload N Records" button) — that stays as-is, it's just triggered by
  a button instead of a drop zone.

## Design

### Data flow

- `app/api/performance/route.ts` already computes per-store sums (the `stores` array,
  before slicing to the top 20) and the list of available `periods`, both already
  respecting an optional `period` query param. Add one field to its JSON response:
  `overallTotals` — an object summing `total_deposit`, `total_withdraw`,
  `company_net_win`, `registered_members`, `deposit_member_count`, `effective_member`,
  and `store_count`, computed from `stores`. No new aggregation logic is introduced;
  this reuses the existing reduce already happening in that route.
- New route `app/api/export/route.ts`: `GET /api/export?period=all|<period>`. Copies the
  same period-filter query logic from `/api/performance` (`eq('period', ...)` or no
  filter for `all`), queries `performance_data` directly (raw, unaggregated rows — one
  row per store per period), serializes to CSV, and returns it with
  `Content-Type: text/csv` and `Content-Disposition: attachment;
  filename="performance_data.csv"`. This is a raw backup/record of the whole dataset
  (database column names as headers) — confirmed with Claire it is **not** meant to be
  re-uploaded through the Import button. Import only ever reads the original vendor CSV
  exports (e.g. `February.csv`), which use different column headers and require picking
  a period in the UI; round-tripping an exported file through Import is explicitly out
  of scope.
- The SSS Data page calls `/api/performance?period=<selected>` on mount and whenever the
  period dropdown changes, populating both the Overall card and the dropdown's period
  list.

### UI layout

- Page header becomes a flex row (matching the Performance page's header pattern):
  title + subtitle on the left; on the right, a period `<select>` (options: "All Time"
  plus every period returned by the API), an **Export** button, and an **Import**
  button.
- The drag-and-drop box is removed entirely. **Import** triggers a hidden
  `<input type="file" accept=".csv">` via a ref click — same `handleFile` parsing logic
  that exists today.
- A new **Overall** summary card sits directly below the header, always visible:
  total deposit, total GGR, total registered members, and store count, using the same
  ₱ currency formatting (`toLocaleString('en-PH', ...)`) already used on the Performance
  page. Shows zeros with a "No data yet" note when there are no rows for the selected
  period.
- Once a file is picked via Import, the existing flow appears unchanged below the
  Overall card: column warnings (Partner/DSP detection), the period selector *for that
  upload* (Monthly/Daily + month/year or date), the preview table (first 10 rows), and
  the "Upload N Records" button.
- **Export** does `fetch('/api/export?period=' + selectedPeriod)`, reads the response as
  a Blob, and triggers a download via a temporary `<a download>` click — no page
  navigation, no new tab.

### Error handling

- If `/api/performance` fails, the Overall card shows the same inline red error banner
  pattern already used elsewhere on this page, instead of leaving the page in a broken
  state.
- If `/api/export` finds no rows for the selected period, it still returns a valid CSV
  containing only the header row — empty results are not an error.
- If the export `fetch()` itself fails (network error or non-200 response), show the
  same inline error banner rather than failing silently.

## Testing

- Manual verification in the browser (per project convention — no test suite exists in
  this repo): upload a CSV, confirm the Overall card updates; switch the period filter
  and confirm totals change accordingly; click Export with "All Time" and with a
  specific period selected, confirm the downloaded CSV's row count and content match
  what's expected; confirm Import still opens the file picker and the existing
  upload flow works unchanged after picking a file.
