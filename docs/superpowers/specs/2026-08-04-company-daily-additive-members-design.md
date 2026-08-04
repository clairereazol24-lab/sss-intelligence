# Company Daily-Additive Members Upload

## Problem

Company (LakiWin Marketing) has no `performance_data` (SSS Data) pipeline — its deposit/withdraw/GGR figures come entirely from the `members` table, uploaded via the Members import. Today, a `members` row for a given `(username, partner, period)` is treated as a full snapshot as of that period, and reads pick "latest period per username wins" (see `app/api/performance/route.ts` and `app/api/members/route.ts`).

LakiWin Marketing's own reporting source can only be pulled for a bounded window (~3 months) at a time. A monthly "current totals" re-pull permanently loses a member's true all-time deposit/withdraw once their activity falls outside that window — there's no way to recover the missing history. Switching to daily uploads avoids ever needing a wide pull, but daily files report that **day's new activity**, not a running total — so today's overwrite-on-latest-period behavior would understate a member's real cumulative totals.

## Behavior

Scope: `POST /api/members`, only when `period_type === 'daily'` **and** the upload's `partner === 'Company'`. Every other path (Monthly uploads, all other partners, Daily uploads for other partners) is unchanged.

For each username in a Company daily upload:

1. Look up that username's most recent *existing* `members` row with `period` strictly less than today's upload date (the "baseline" — last known cumulative snapshot, from any period type).
2. **Returning member (baseline found):** the new row's `deposit`, `withdraw`, `deposit_times`, `withdraw_times`, and `company_net_win` = baseline value + today's file's value for that field. All other fields (`status`, `last_login_time`, `member_rank`, `sub_affiliate_name`, `dsp`, etc.) take today's file's value as-is, same as today.
3. **New member (no baseline):** inserted as-is — today's file's numbers become their starting cumulative baseline.
4. `registered_time` / `first_deposit_amount` keep the existing "locked to earliest-ever record for that username" behavior — unchanged.
5. Upsert on `(username, partner, period)`, same as today.

### Same-day re-upload safety

The baseline lookup excludes `period >= today's date`, so re-running today's upload always recomputes from the same untouched prior baseline. Uploading the same day's file twice produces the same result both times — no double-counting, no new tracking table needed.

### Assumptions

- Uploads happen in chronological day order. Backfilling an earlier missed day *after* later days already exist is not supported — later days' stored cumulative totals would not retroactively include the backfilled day's delta. (Confirmed acceptable: Company always uploads in order.)
- If a username appears twice within a single day's uploaded file, the existing dedup ("last occurrence in file wins") still applies — the second occurrence's baseline-plus-delta computation wins and the first is dropped. Pre-existing behavior, not changed by this work.

## What does NOT change

- `app/api/upload/route.ts` (SSS Data / `performance_data`) — untouched. Company never used this pipeline; other partners' behavior isn't part of this change.
- `app/api/performance/route.ts` GET — untouched. Its "latest period per username wins" read logic already produces the correct cumulative figure once each stored row is itself a correct cumulative snapshot.
- `lib/marketing-performance.ts` — untouched, but its `computeCompanyMetrics` already documents Company member rows as "running totals-to-date, never summed across periods." Before this change that assumption wasn't actually true for Company's daily rows; this change makes the stored data match the contract that code was already written against.
- Monthly upload mode (cohort-by-registered-time) — untouched.

## Follow-up fixes from final review (folded into this branch)

A final whole-branch review found four gaps in the read paths and UI surrounding this change, all fixed in the same branch before merge:

- **`app/(app)/members/MembersClient.tsx`** — the Daily/Monthly picker now defaults to Daily specifically when `partner === 'Company'`. Originally scoped as "unchanged" in this spec, but a Company upload left on Monthly would silently write a raw (non-cumulative) snapshot that then poisons the next real daily upload's baseline — the one failure mode serious enough to require touching the UI.
- **`app/api/members/route.ts` POST** — now detects the out-of-order case (uploading a period earlier than one already stored) and returns a `warning` string in the response, surfaced in the Members page's success message. The additive design can't self-heal from a backfill; silently doing nothing was worse than saying so.
- **`app/api/members/route.ts` GET**, `from`/`to` range branch — now de-dups to the latest period per username (scoped per partner), matching the no-period fallback path's existing behavior. Without this, a username with several period rows in range would appear once per row instead of once at its latest cumulative total.
- **`app/api/members/route.ts` POST** — the two full-table scans (lock-to-earliest-record lookup and cumulative-baseline lookup) now share a single fetch.

## Implementation sketch (`app/api/members/route.ts` POST)

```ts
let cumulativeBaseline: Record<string, any> = {}
if (period_type === 'daily' && partnerVal === 'Company') {
  const priorRows = await fetchAllMembers(
    partnerVal,
    'username, period, deposit, withdraw, deposit_times, withdraw_times, company_net_win'
  )
  for (const r of priorRows) {
    if (r.period == null || r.period >= period) continue
    const existing = cumulativeBaseline[r.username]
    if (!existing || r.period > existing.period) cumulativeBaseline[r.username] = r
  }
}

const mergedRecords = records.map((r: any) => {
  const ex = existingMap[r.username]
  let base = ex
    ? { ...r, registered_time: ex.registered_time || r.registered_time, first_deposit_amount: ex.first_deposit_amount || r.first_deposit_amount }
    : r
  const baseline = cumulativeBaseline[r.username]
  if (baseline) {
    base = {
      ...base,
      deposit: (baseline.deposit || 0) + (r.deposit || 0),
      withdraw: (baseline.withdraw || 0) + (r.withdraw || 0),
      deposit_times: (baseline.deposit_times || 0) + (r.deposit_times || 0),
      withdraw_times: (baseline.withdraw_times || 0) + (r.withdraw_times || 0),
      company_net_win: (baseline.company_net_win || 0) + (r.company_net_win || 0),
    }
  }
  return { ...base, period, period_type: period_type || null }
})
```

This slots in between the existing `existingMap` computation and the existing dedup step — no other changes to the function.

## Data reset

Existing Company `members` data (59 rows: one stale Monthly batch at period `2026-07`, plus daily rows already uploaded at `2026-08-01` under the old overwrite behavior) was backed up to `_backup_company_members_2026-08-04.json` and deleted from the `members` table on 2026-08-04, so daily uploads can restart cleanly under the new additive behavior. `stores` and `performance_data` were not touched (0 Company rows existed in `performance_data`; the `stores` directory entry for LakiWinMarketing was left in place).

## Testing

No automated test suite in this project (`npm run build` is the only check). Manual verification:

1. Upload a Company daily file for day 1 with a few usernames — confirm rows are inserted with the file's raw values (correct starting baseline).
2. Upload day 2 with the same usernames plus one new one — confirm existing usernames' deposit/withdraw/deposit_times/withdraw_times/company_net_win equal day1 + day2, and the new username is inserted with day 2's raw values only.
3. Re-upload day 2's file again unchanged — confirm totals for day 2 stay identical to the first day-2 upload (idempotent, no double-count).
4. Confirm a username absent from day 2's file keeps their day-1 values when viewed via `/api/members` (no period specified) and via the Company performance page.
5. Confirm a Monthly upload for Company (if ever used again) and Daily uploads for other partners are unaffected — spot check one existing partner's daily/monthly path still upserts as before.
6. `npm run build` passes with no TypeScript errors.
