# Locked Retailers: Uncollected-Deposit Report

## Problem

DSPs sometimes fail to collect the deposit amounts owed from a store, and Claire
locks that retailer in response. She currently has no way to see, at a glance, how
much money is sitting uncollected across her locked retailers, or which DSP is
responsible for the most of it — so she can't prioritize who to chase first. She
needs to paste in the list of Sub Affiliate IDs she's locked and get back their
full sales history (deposit, withdraw, valid bet, GGR, etc.) already sitting in SSS
Data, ranked so the worst offenders float to the top.

## Goals

- A new top-level nav page, **Locked Retailers**, with a textarea to paste Sub
  Affiliate IDs (one per line or comma-separated) and a "Generate & Download Excel"
  button.
- Submitting looks up each ID's **all-time cumulative** totals from
  `performance_data` (summed the same way the existing SSS Data overview
  aggregates a store's history across every uploaded period) and generates an
  `.xlsx` file with three sheets:
  1. **Locked Retailers** — one row per matched ID, sorted by Total Deposit
     descending: Sub Affiliate, Store Name, Partner, DSP, Total Deposit, Total
     Withdraw, Valid Bet Amount, Company Net Win (GGR), Payout Amount, Registered
     Members, Deposit Member Count, Effective Member.
  2. **DSP Summary** — matched retailers grouped by DSP, sorted by Total Deposit
     descending: DSP, Locked Retailer Count, Total Deposit, Valid Bet Amount,
     Company Net Win (GGR). This is the "which DSP to bug first" view.
  3. **Not Found** — any pasted Sub Affiliate ID with no matching row anywhere in
     the system (`performance_data` or `stores`), so Claire knows which ones to
     double-check.
- Duplicate IDs in the pasted list are deduped before querying.
- The whole flow is stateless: paste → query → generate → download. Nothing is
  persisted. Re-running with an updated list (some resolved, some new) is the
  intended workflow — no "saved list" to manage.

## Non-goals

- No new database tables or migrations — this reads existing `performance_data`
  and `stores` data only.
- No AI-generated narrative/commentary. The "analysis" Claire needs is the ranked
  ordering plus the DSP rollup, not written prose (confirmed: the point is
  operational — knowing who to chase — not a report to read).
- No date-range picker — totals are always all-time cumulative, consistent with
  how "locked until the DSP collects" framing implies the full outstanding amount,
  not a single period's.
- No persistence of the locked list, no "mark as resolved" UI, no history of past
  uploads. Claire re-pastes the current list each time.
- No changes to the existing SSS Data, Store Directory, or AI Report pages/tables.

## Design

### Data flow

A new route, `app/api/locked-retailers/route.ts`, exposes `POST` accepting
`{ subAffiliateIds: string[] }`.

1. Dedupe the incoming ID list.
2. Query `performance_data` filtered with `.in('sub_affiliate', ids)`, paginated
   the same way `app/api/performance/route.ts` already paginates (1000-row pages,
   loop until a short page is returned — the existing fix for the API's row-limit
   bug per project history).
3. Aggregate all-time totals per `sub_affiliate` using the same sum-across-all-rows
   pattern already implemented in `app/api/performance/route.ts` (lines ~39-72):
   sum `total_deposit`, `total_withdraw`, `valid_bet_amount`, `company_net_win`,
   `payout_amount`, `registered_members`, `deposit_member_count`,
   `effective_member` per `sub_affiliate`, carrying `store_name`, `partner`, `dsp`
   from the rows.
4. For any requested ID with zero `performance_data` rows, look it up in `stores`
   (by `sub_affiliate`) to still capture `store_name`/`partner`/`dsp` if it's a
   known store with no performance history yet — it still lands in the "Locked
   Retailers" sheet with zeroed totals, not "Not Found". Only IDs matching neither
   table go to "Not Found".
5. Sort the matched list by `total_deposit` descending.
6. Build the DSP rollup: group matched retailers by `dsp` (falling back to
   `"Unknown"` for a null/blank DSP, matching the existing convention in
   `app/api/performance/route.ts:140`), summing `total_deposit`,
   `valid_bet_amount`, `company_net_win`, and counting retailers per group. Sort by
   `total_deposit` descending.
7. Build the workbook server-side with the `xlsx` package (already a project
   dependency, currently used client-side in `PerformancePage.tsx` for parsing —
   this is the first server-side use for *writing*), producing three sheets in the
   order above.
8. Respond with the binary `.xlsx` buffer, `Content-Type:
   application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and
   `Content-Disposition: attachment; filename="locked-retailers-<YYYY-MM-DD>.xlsx"`.

### UI layout

New page `app/(app)/locked-retailers/page.tsx` + client component, added as its
own top-level sidebar nav item ("Locked Retailers"), alongside SSS Data / Store
Directory / etc.

- A textarea for pasting IDs (one per line or comma-separated), with a live count
  of parsed, deduped IDs below it.
- A "Generate & Download Excel" button, disabled when the textarea is empty.
- On click: POST to `/api/locked-retailers`, then trigger a browser download of
  the returned file via a `Blob` + temporary `<a download>` (same pattern as any
  existing file-download flow in the app).
- After a successful generation, a short inline summary: "X matched, Y not found"
  (Y only shown if > 0) so Claire gets immediate feedback without opening the file.
- If the textarea is empty, the button stays disabled — no separate validation
  error needed.
- If the POST fails (network error or non-2xx), an inline red error banner
  appears, matching the existing error-banner pattern elsewhere in the app
  (e.g. Store Directory bulk import).

### Edge cases

- **All IDs unmatched**: still returns a valid `.xlsx` — sheet 1 empty (header row
  only), sheet 3 fully populated. Not an error condition.
- **Duplicate IDs pasted**: deduped client-side before the count/display, and
  server-side again defensively before querying.
- **ID matches a store with no performance data yet**: appears in sheet 1 with all
  numeric fields at 0, not treated as "not found" (it's a known store, just one
  with nothing uploaded for it yet).

## Testing

Manual verification in the browser (per project convention — no test suite
exists): paste a list containing a mix of IDs with performance history, an ID that
exists only in `stores` with no performance rows, and a made-up ID that matches
nothing; generate and open the downloaded file; confirm sheet 1 is sorted by Total
Deposit descending and totals match what SSS Data shows for those same IDs, sheet 2
correctly rolls up and sorts by DSP, and sheet 3 lists only the made-up ID.
