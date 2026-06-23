# Performance Page: Four Top 20 Lists

## Problem

The Performance page shows two leaderboards: Top 20 Stores by Deposit (with a weighted
Score/Status column Claire found confusing and doesn't want) and Top 20 DSPs by Store
Count. Claire wants four leaderboards instead: the existing two (with Score/Status
removed from the Stores list), plus Top 20 Stores by Registered Members and Top 20 DSPs
by Deposit.

## Goals

- Remove the Score/Status (Scale/Maintain/Fix) column and its underlying weighted
  calculation from the Top 20 Stores by Deposit list. It keeps its existing sort (by
  Total Deposit) and remaining columns.
- Add Top 20 Stores by Registered Members — same per-store data, sorted by
  `registered_members` descending instead of deposit.
- Add Top 20 DSPs by Deposit — same per-DSP data as the existing DSPs list, sorted by
  `total_deposit` descending instead of store count.
- Top 20 DSPs by Store Count stays exactly as it is today.
- Result: four distinct Top 20 sections on the Performance page, no duplicates.

## Non-goals

- No change to the period filter (`All Time` / specific period dropdown) — all four
  lists continue to respect whatever period is selected, the same way the existing two
  do today.
- No change to `/api/performance`'s other response fields (`overallTotals`, `allStores`,
  `lastUpdated`) — those are used by the SSS Data page and are untouched here.
- No change to how stores/DSPs are aggregated (still deduplicated by `sub_affiliate`,
  still grouped by `dsp__partner` for the DSP lists) — only the *sort* and *which fields
  are exposed* change.

## Design

### Data flow

`app/api/performance/route.ts` removes the `maxDeposit`/`storesWithScore` block (the
weighted score calculation) entirely. `top20Stores` becomes a plain sort of `stores` by
`total_deposit` descending, sliced to 20 — no `score`/`label` fields attached.

Two new fields are added to the JSON response:

- `top20StoresByMembers`: `stores` sorted by `registered_members` descending, sliced to
  20. Reuses the same `stores` array — no new aggregation logic.
- `top20DSPsByDeposit`: the same `dspMap` already built for `top20DSPs`, sorted by
  `total_deposit` descending instead of `store_count`, sliced to 20.

### UI layout

`app/performance/page.tsx` fetches the same `/api/performance?period=...` endpoint and
reads four arrays instead of two: `top20Stores`, `top20StoresByMembers`, `top20DSPs`,
`top20DSPsByDeposit`. Four sections render in that order, each its own card matching the
existing visual style (white card, header row, table):

1. **🏆 Top 20 Stores by Deposit** — columns: #, Store, DSP, Partner, Total Deposit, GGR.
   (Score and Status columns removed from the current table.)
2. **⭐ Top 20 Stores by Registered Members** (new) — columns: #, Store, DSP, Partner,
   Registered Members, Total Deposit.
3. **👤 Top 20 DSPs by Store Count** — unchanged.
4. **💰 Top 20 DSPs by Deposit** (new) — same columns as the Store Count list (#, DSP,
   Partner, Stores, Total Deposit, Total GGR), sorted differently.

Each list's empty state matches the existing pattern ("No data. Upload a CSV first.").

### Error handling

No change — the page's existing loading state and empty-state handling already cover
all four lists, since they come from the same single fetch.

## Testing

Manual verification in the browser (per project convention — no test suite exists):
load the Performance page with existing data, confirm four distinct sections render in
the order above; confirm the Stores by Deposit list no longer shows Score/Status;
confirm Stores by Registered Members is sorted correctly (highest registered members
first); confirm DSPs by Deposit is sorted by deposit, distinct from the DSPs by Store
Count ordering; change the period filter and confirm all four lists update together.
