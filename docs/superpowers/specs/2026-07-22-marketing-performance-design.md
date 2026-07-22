# Marketing Performance module — design

## Why

Track store visits (Community activation or Booth Activation) and automatically show whether
that visit correlates with growth in the store's deposits, GGR, and registered members — by
splitting the store's entire SSS Data history at the visit date into a "Before" and "After"
bucket.

This rebuilds the existing hidden, half-built `marketing_efforts` module in place (same
permission key, same table, same route) rather than adding a new one — the old module's
fields (Location, Activities Done, Headcount, Notes, Report file) are being dropped since the
table is confirmed empty (0 rows) in production.

Note: this is a **different module** from the existing "Performance" nav item
(`/performance/alpharus`, `/performance/relevant-tech`), which is DSP/store deposit-GGR
breakdown by upload period — unrelated to store visits. To avoid confusion the new module is
labeled **"Marketing Performance"** in the nav, distinct from "Performance."

## Data model

### `marketing_efforts` table (rebuilt)

```sql
-- Drop old columns (table confirmed empty, no data loss)
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS location;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS store_name;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS activities_done;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS headcount;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS notes;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS report_file_url;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS report_file_name;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS report_file_type;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS total_deposit;
ALTER TABLE marketing_efforts DROP COLUMN IF EXISTS date; -- replaced by date_visit

-- Add new columns
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS date_visit DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS partner VARCHAR(100);
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS dsp VARCHAR(200);
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS sub_affiliate VARCHAR(100) NOT NULL;
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS sub_affiliate_name VARCHAR(200);
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS marketing_type VARCHAR(20) NOT NULL
  CHECK (marketing_type IN ('Community', 'Booth Activation'));
ALTER TABLE marketing_efforts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_marketing_sub_affiliate ON marketing_efforts(sub_affiliate, partner);
CREATE INDEX IF NOT EXISTS idx_marketing_date_visit ON marketing_efforts(date_visit);
```

Final shape: `id, date_visit, partner, dsp, sub_affiliate, sub_affiliate_name, marketing_type,
created_by, created_at`.

### Matching key

`sub_affiliate` + `partner` — the same composite key used throughout this app
(`performance_data`, `members`, Store Directory) to identify a store.

### Before / After computation (live, never stored)

For a given visit row, computed fresh by the GET route on every request — not cached, not
snapshotted:

- **Before Visit** (fixed once computed — everything strictly prior to the visit):
  - Total Deposit = `SUM(performance_data.total_deposit)` WHERE `sub_affiliate` + `partner`
    match AND `period < date_visit`
  - Total GGR = `SUM(performance_data.company_net_win)`, same filter
  - Total Registered Members = count of distinct `members.username` (deduped per the app's
    existing union-by-username rule — see `feedback_supabase_schema_changes` / Members module
    notes) WHERE `sub_affiliate` + `partner` match AND `registered_time < date_visit`
- **After Visit** (open-ended, grows automatically as new SSS Data is uploaded):
  - Same three metrics, same filters, but `period >= date_visit` / `registered_time >=
    date_visit`
- **Δ (after − before)** is derived client-side for display, not stored.

Known limitation (inherited from the rest of the app, not new): `performance_data.period` is
a string, either `'YYYY-MM'` (monthly) or `'YYYY-MM-DD'` (daily), compared lexicographically
against `date_visit`. A monthly period string sorts as "before" any daily period in the same
month via plain string comparison — the same simplification already used by `/api/performance`
elsewhere in this app. Not solved here; consistent with existing behavior.

## API routes

- `GET /api/marketing-efforts` — returns all visit rows plus computed Before/After/Δ for each,
  paginated per this app's standing "always paginate every DB fetch" rule (`performance_data`
  and `members` can both exceed 1000 rows).
- `POST /api/marketing-efforts` — creates a visit row. Body: `{ date_visit, partner, dsp,
  sub_affiliate, sub_affiliate_name, marketing_type }`.
- `DELETE /api/marketing-efforts/[id]` — deletes a visit row.
- Old `/api/marketing` route is deleted (backed the previous hidden page, no longer needed).

## UI

### Entry form ("+ Add Visit")

- **Sub Affiliate** — type-to-filter dropdown sourced from the Store Directory (`stores`
  table). Selecting a store auto-fills Partner, DSP, and Sub Affiliate Name as read-only
  display fields (not independently editable — prevents them drifting out of sync with the
  selected store and silently breaking the SSS Data match).
- **Date Visit** — plain date input, defaults to today but fully editable to any date,
  including backdating when a visit is logged after the fact.
- **Marketing Type** — dropdown: Community or Booth Activation.
- No Notes, Headcount, Location, or Report file fields (dropped per Section 4 decision).

### List view

- Single combined table (no per-partner sub-pages like Performance/Members) — Partner shown
  as its own column instead, since visit volume is expected to be low.
- Columns: Date Visit, Partner, DSP, Sub Affiliate Name, Marketing Type, then grouped
  **Before** (Deposit / GGR / Members) and **After** (Deposit / GGR / Members) sub-columns,
  plus a **Δ** column per metric (After − Before).
- Filters: Sub Affiliate Name / Partner / Marketing Type / date range search.
- Row click → detail drawer (same right-panel pattern as Wrong Issuance / Operations) showing
  the same numbers larger, plus the literal date ranges used for Before/After (e.g. "Before:
  through 2026-06-10", "After: 2026-06-10 → today") so the computation is auditable.
- No CSV export in v1.

## Nav & permissions

- Reuse the existing `marketing_efforts` permission key — no new `module_permissions` CHECK
  constraint migration needed.
- `lib/auth.ts` MODULES: uncomment and relabel the entry —
  `{ key: 'marketing_efforts', label: 'Marketing Performance', href: '/marketing-efforts', icon: '📣' }`.
- Route path stays `/marketing-efforts` (URL doesn't need to match the display label).
- `supabase/schema.sql` updated to reflect the new `marketing_efforts` column set, for
  documentation parity with the live table (which the user runs manually via Supabase SQL
  Editor — no direct DB connection available in this environment).
