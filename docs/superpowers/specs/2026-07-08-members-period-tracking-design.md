# Members Period Tracking

## Problem

The `members` table (username, partner, deposit, withdraw, status, etc.) has no
period/date column. Every import upserts on `(username, partner)`, so each new
upload overwrites the previous one's deposit/withdraw/status values entirely —
there's no history. Deposit/Withdraw figures represent that upload's period
activity (confirmed with Claire), not lifetime totals, so overwriting them on
every import silently destroys real data.

This breaks the Performance page's period picker: selecting a period correctly
filters the Stores/DSP tables (`performance_data` is already period-aware), but
the Members-by-Deposit and Members-by-GGR tables always show the latest
snapshot, ignoring the selected period entirely.

## Goals

- Give `members` rows a `period`/`period_type`, matching the convention
  already used by `performance_data` (`"YYYY-MM"` monthly / `"YYYY-MM-DD"`
  daily).
- Members import (`app/(app)/members/MembersClient.tsx`) collects a period the
  same way the SSS Data importer does, and each import adds new period-scoped
  rows instead of overwriting the previous period's data.
- Performance page's period picker filters the Members-by-Deposit/GGR tables
  by the selected period.
- Dashboard's From/To range filter (`app/(app)/dashboard/page.tsx`) applies
  the same range to its member summary/Top-50 calls, not just
  `/api/performance`.
- Views that don't specify a period (Members page listing, Dashboard when no
  From/To is set) keep behaving exactly as they do today — showing the latest
  snapshot — with no visible change.
- The 1,390 existing member rows (no period recorded) remain visible under
  "All Time" / no-filter views, but are excluded once a specific period or
  date range is selected.

## Non-goals

- SSS Data page (`app/(app)/sss-data/SSSDataClient.tsx`): it displays no
  member-sourced data today (its Overall/Store Summary cards and Export come
  entirely from `performance_data`, already period-filterable). No changes.
- No period selector added to the Members page or Dashboard UI — both keep
  their current "latest snapshot" behavior, per Claire's decision.
- No backfill of the 1,390 legacy rows with a synthetic period — they stay
  `period = NULL` permanently unless Claire re-uploads them herself.
- No change to `performance_data`'s existing string range-comparison
  behavior (monthly-vs-daily granularity mismatch across a From/To span) —
  same accepted limitation as the 2026-06-23 SSS Data range filter design,
  now also applying to `members`.

## Design

### Schema

```sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS period VARCHAR(20);
ALTER TABLE members ADD COLUMN IF NOT EXISTS period_type VARCHAR(10);
```

- `period` / `period_type` are `NULL` on all existing rows.
- New rows always get both set by the import route.

The existing unique constraint enforcing one row per `(username, partner)`
must become `(username, partner, period)`. Since `members` isn't defined in
`supabase/schema.sql` (it was created directly in Supabase, outside the
tracked schema — confirmed by inspecting the live table), the migration does
not hardcode a guessed constraint name. Instead it looks the name up
dynamically and drops it before adding the new one:

```sql
DO $$
DECLARE
  cname text;
BEGIN
  SELECT tc.constraint_name INTO cname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'members'
    AND tc.constraint_type = 'UNIQUE'
  GROUP BY tc.constraint_name
  HAVING array_agg(kcu.column_name ORDER BY kcu.column_name) = ARRAY['partner', 'username'];

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE members DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE members ADD CONSTRAINT members_username_partner_period_key
  UNIQUE (username, partner, period);
```

Postgres treats each `NULL` as distinct for uniqueness, so the 1,390 legacy
rows (`period = NULL`) don't collide with each other or with future
period-tagged rows.

### Upload flow

`app/(app)/members/MembersClient.tsx` gains the same `periodType`
('monthly'/'daily') + month/year-or-date controls as
`app/(app)/sss-data/SSSDataClient.tsx`'s `getPeriod()`, validated the same
way before upload is allowed. The POST body adds `period`/`period_type`
alongside `records`.

`app/api/members/route.ts` `POST`:
- Stamps `period`/`period_type` onto every record.
- `onConflict` changes from `'username,partner'` to `'username,partner,period'`.
- The "lock `registered_time`/`first_deposit_amount` to first upload" logic
  changes from "last row seen while building the map wins" (unreliable once
  a username can have multiple period-rows) to: fetch all existing rows for
  the partner, group by `username`, and within each group keep the row with
  the earliest `registered_time` (falling back to the lexicographically
  earliest non-null `period` if `registered_time` is missing/tied) as the
  source of truth. That row's `registered_time`/`first_deposit_amount` is
  applied to the new record; everything else in the new record is used as-is.

### API filtering

`app/api/members/route.ts` `GET` gains the same filter shape already used by
`app/api/performance/route.ts`:

```ts
const period = searchParams.get('period')
const from = searchParams.get('from')
const to = searchParams.get('to')

if (period && period !== 'all') {
  query = query.eq('period', period)
} else if (from && to) {
  query = query.gte('period', from).lte('period', to)
} else {
  // latest-period fallback, see below
}
```

**Latest-period fallback** (no `period`/`from`/`to` given — the Members page,
unfiltered Dashboard): resolved **independently per partner**, not globally.
For each distinct `partner` value present (or just the one requested, if a
`partner` param is given), resolve `MAX(period)` among that partner's rows
where `period IS NOT NULL`, and keep only rows matching that partner's own
latest period; if that partner has no non-null period yet, keep its
`period IS NULL` rows instead. The final row set is the union across
partners. This matters for the Dashboard's combined Top 50
(`/api/members?top=deposit`, no `partner` param): if Alpharus and Relevant
Tech are on different upload cadences, a global `MAX(period)` would pick
whichever partner's period string sorts latest and silently drop the other
partner's members entirely — per-partner resolution avoids that.

`summary=true`, `top=deposit`, `top=ggr`, `full=true` are unchanged — they
apply after the period filter/fallback has already narrowed the row set.

### Frontend wiring

- **`app/(app)/dashboard/page.tsx`**: `fetchAll`'s `/api/members?...&summary=true`
  and `/api/members?top=deposit` calls append the same `from`/`to` query
  params already built for the `/api/performance` calls (the existing `base`
  string, only applied once both From and To are set — unchanged behavior
  for a single date).
- **`app/(app)/performance/PerformancePage.tsx`**: `fetchData`'s
  `/api/members?top=deposit&full=true...` and `/api/members?top=ggr&full=true...`
  calls append `&period=${period}` (omitted when `period === 'all'`).
- **SSS Data**: no changes (no non-goal).

## Testing

No test suite exists in this repo (manual verification is the project
convention). Plan:

1. Run the schema migration against the live Supabase DB; confirm via a
   throwaway `.mjs` script (service role key, deleted after) that `period`/
   `period_type` columns exist and the new unique constraint is in place.
2. Upload a Members CSV for a specific date on the Members page; confirm a
   new row is inserted (not an overwrite of the legacy row) and
   `registered_time`/`first_deposit_amount` for a returning username match
   their original values.
3. Upload a second Members CSV for a different date for an overlapping set
   of usernames; confirm both period-rows exist independently.
4. On the Performance page, switch the period picker across a period with
   member data and one without; confirm Members-by-Deposit/GGR tables change
   accordingly, including showing empty for a period with no member upload.
5. On the Dashboard, set From/To spanning member-upload dates; confirm
   member counts and Top 50 change; clear both fields and confirm it reverts
   to the latest-period fallback.
6. Confirm the Members page (no period selector) still shows the
   latest-period snapshot correctly, unaffected by the above.
