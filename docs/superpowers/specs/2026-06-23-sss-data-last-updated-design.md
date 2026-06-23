# SSS Data Page: Last Updated Indicator

## Problem

There's no indicator of when data was last uploaded to the SSS Data page. Claire wants a
small text line below the Overall card showing the most recent upload's period.

## Goals

- `/api/performance` returns a new field `lastUpdated: { period: string, period_type:
  string } | null` — the single most recently created row (by `created_at`), independent
  of any `from`/`to` filter.
- The SSS Data page shows a small text line below the Overall card: "Last updated:
  <formatted period>" — month name + year for a monthly upload, a full date for a daily
  upload.
- If no data exists at all, the line is omitted entirely.

## Non-goals

- Not affected by the From/To date range filter — always reflects the latest upload
  regardless of what's currently displayed in the Overall card or Store Summary table.
- No relative time ("2 hours ago") — just the upload's period, formatted.
- Ordered by `created_at` (actual upload time), not by comparing `period` strings — this
  sidesteps the known monthly/daily string-comparison limitation entirely, since it's
  asking "what was uploaded most recently" rather than "what's the latest period."

## Design

### Data flow

`app/api/performance/route.ts` gets one more small query, independent of the existing
period/from/to filtering in the route:

```ts
const { data: lastRow } = await supabase
  .from('performance_data')
  .select('period, period_type')
  .order('created_at', { ascending: false })
  .limit(1)

const lastUpdated = lastRow && lastRow.length > 0 ? lastRow[0] : null
```

Added to the JSON response alongside the existing fields: `{ ..., lastUpdated }`.

### UI

The SSS Data page's `fetchOverall` reads `data.lastUpdated` into a new state variable.
Below the Overall card, a small text line renders only if `lastUpdated` is not null:

- If `period_type === 'monthly'`: parse `"YYYY-MM"` and format as e.g. "February 2026",
  using the page's existing `monthNames` array (already defined for the upload period
  selector).
- If `period_type === 'daily'`: parse `"YYYY-MM-DD"` and format as a readable date, e.g.
  via `new Date(period + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric',
  month: 'long', day: 'numeric' })`.

### Error handling

No new error state. If `/api/performance` fails, the existing error banner already
covers it; the "Last updated" line simply doesn't render, the same way `overallTotals`
doesn't render its numbers when an error has occurred.

## Testing

Manual verification in the browser (per project convention — no test suite exists):
upload a monthly CSV, confirm "Last updated: <Month> <Year>" appears below the Overall
card; upload a daily CSV afterward, confirm the line updates to the full date format;
change the From/To filter and confirm the "Last updated" text does *not* change — it
stays pinned to the most recent upload regardless of the selected range; with no data at
all, confirm the line doesn't render.
