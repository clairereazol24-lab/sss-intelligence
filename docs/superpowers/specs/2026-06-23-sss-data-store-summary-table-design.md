# SSS Data Page: Store Summary Table

## Problem

The SSS Data page shows an "Overall" card with combined totals across all stores, but no
per-store breakdown. Claire wants to see, below the Overall card, a table listing every
store's own totals — sourced from the same uploaded CSV data, summed across all uploads
for that store (so a store appearing in both February and March shows one row with both
months added together, not two rows).

## Goals

- Add a "Store Summary" table to the SSS Data page, directly below the Overall card.
- Columns, in this order: Partner, DSP, Sub Affiliate, Sub Affiliate Name, Total Deposit,
  Total Withdraw, Valid Bet Amount, Company Net Win (GGR), Payout Amount, Registered
  Members.
- Each row is one store (`sub_affiliate`), with its numeric columns summed across every
  upload that falls in the selected date range — same dedup-by-`sub_affiliate` behavior
  the Overall card and Performance page's per-store aggregation already use.
- The table shares the same From/To date range as the Overall card: changing the range
  updates both together, via the same fetch.
- Rows sorted by Total Deposit, descending.
- No row cap — every store with data in range is shown, in a scrollable container.

## Non-goals

- The Performance page and its `top20Stores` field are unaffected — this reuses the same
  underlying per-store aggregation but exposes it as a new, separate field so the
  Performance page's existing top-20 leaderboard behavior doesn't change.
- No new dedicated API endpoint — extends the existing `/api/performance` route (see
  Design below) rather than introducing `/api/store-summary` or similar.
- No pagination — "scrollable, no cap" is the only large-list handling needed at current
  data volumes.
- No change to how `Partner`/`DSP` null values are displayed — stores with no DSP
  (already a normal, accepted case) just show a blank cell.

## Design

### Data flow

`app/api/performance/route.ts` already builds a `storeMap` keyed by `sub_affiliate`,
summing `total_deposit`, `total_withdraw`, `company_net_win`, `registered_members`,
`deposit_member_count`, `members_withdrawn`, and `effective_member` across every row in
the requested period/range. Two fields get added to that same sum: `valid_bet_amount` and
`payout_amount` (read from the same raw `performance_data` rows, not currently summed
anywhere).

The route's JSON response gets one new field: `allStores` — the full `stores` array
(every store with data in the requested range, not capped), sorted by `total_deposit`
descending. This is separate from the existing `top20Stores` field (which keeps its own
top-20 slice, untouched, still used by the Performance page).

On the SSS Data page, `fetchOverall` (which already calls `/api/performance?from=&to=`
for the Overall card) reads `data.allStores` into a new `allStores` state array. Since
it's the same fetch, changing the From/To range updates the Overall card and the new
table together, with no extra network request.

### UI layout

A new "Store Summary" section sits directly below the existing Overall card and above
the file-status line. It's a table with the 10 columns listed in Goals, in that order.
Currency columns (Total Deposit, Total Withdraw, Valid Bet Amount, Company Net Win (GGR),
Payout Amount) use the existing `fmt` helper (₱, 2 decimals). Registered Members is a
plain number via `toLocaleString()`. The table sits in a scrollable container (vertical
scroll for many rows, horizontal scroll for the 10 columns on narrow viewports), matching
the existing `overflow-x-auto` pattern already used for the upload preview table.

### Error handling

No new error UI — a failed `/api/performance` call already sets `overallError`, which
renders via the existing red banner shared with the Overall card above. If the response
succeeds but `allStores` is empty for the selected range, the table section shows a
"No data yet" message, consistent with the Overall card's existing empty-state pattern.

## Testing

Manual verification in the browser (per project convention — no test suite exists):
upload data for a couple of stores, confirm the Store Summary table shows correct
per-store sums matching the upload; upload a second batch for one of the same stores
(different period, same `sub_affiliate`), confirm that store's row updates to the summed
total rather than appearing as a second row; change the From/To range and confirm the
table's rows update together with the Overall card; confirm sort order is by Total
Deposit descending; confirm an empty-range selection shows "No data yet" in the table
section.
