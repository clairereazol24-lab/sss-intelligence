# Store Directory: Bulk Import via CSV

## Problem

Store Directory only supports adding stores one at a time through the "+ Add Store"
modal. Claire wants to bulk-import many stores at once from a CSV file — useful for
seeding her full store list (she has 800+ stores, but the directory currently only has
the 262 that have appeared in uploaded performance data so far).

## Goals

- A "Bulk Import" button on the Store Directory page, next to "+ Add Store", that opens
  a CSV file picker.
- After a file is picked and parsed, a modal shows column warnings (for missing required
  columns), a preview table, and an "Import N Stores" button — following the same modal
  pattern just built for the SSS Data page's import flow.
- CSV columns: `Sub Affiliate` and `Store Name` are required; `Partner`, `DSP`, and
  `Deployment Status` are optional.
- Importing upserts by `sub_affiliate` — a row for a `sub_affiliate` that already exists
  in the directory updates that store's fields; a new `sub_affiliate` creates a new row.
  No duplicates.
- An invalid or missing `Deployment Status` value falls back to `"Not Deployed"`, the
  same default used by the existing Add Store form.

## Non-goals

- No bulk edit or bulk delete of existing stores — only bulk *import* (create/update via
  CSV), matching what Claire asked for.
- No change to the single-store Add/Edit modal or its API calls (`POST`/`PUT
  /api/stores`) — bulk import is an additive new endpoint, not a replacement.
- No change to how Store Directory's table, search, or status filter work today.
- No validation beyond the two required columns and falling back on an invalid status —
  e.g. no dedup-within-the-same-file check beyond what the database's `UNIQUE
  (sub_affiliate)` constraint and the upsert's `onConflict` already provide.

## Design

### Data flow

A new route, `app/api/stores/bulk/route.ts`, exposes `POST` accepting `{ stores: [...] }`
where each item has `sub_affiliate`, `store_name`, `partner`, `dsp`,
`deployment_status`. It calls:

```ts
supabase.from('stores').upsert(records, { onConflict: 'sub_affiliate' })
```

This mirrors the upsert Claire's performance-CSV upload already does to this same table
(`app/api/upload/route.ts:26-28`), so the behavior (update-if-exists, insert-if-new) is
consistent across both ways stores can enter the directory.

On the Store Directory page, picking a CSV via the new "Bulk Import" button parses it
with PapaParse (already a dependency, used the same way on the SSS Data page), checks
for the two required columns, and on confirm POSTs the parsed rows to
`/api/stores/bulk`, then refetches the store list (`fetchStores()`).

### UI layout

A "Bulk Import" button sits next to the existing "+ Add Store" button in the page
header. It triggers a hidden `<input type="file" accept=".csv">`, the same pattern used
on the SSS Data page. Once a file is parsed, a modal opens (same visual style as the
SSS Data import modal: dark overlay, white panel, `max-w-3xl`, scrollable):

- A warning banner if `Sub Affiliate` or `Store Name` columns are missing from the CSV
  (import is blocked in that case — the modal stays open with the warning, no
  "Import N Stores" button shown).
- A preview table of the first 10 parsed rows: Sub Affiliate, Store Name, Partner, DSP,
  Deployment Status (showing the literal CSV value, or "Not Deployed" if blank/invalid).
- Cancel (closes the modal, discards the parsed rows) and "Import N Stores" (POSTs to
  the bulk endpoint, then closes the modal and refreshes the table) buttons.

### Error handling

If the bulk POST fails (network error or a non-200 response), the modal shows an inline
error banner (matching the existing red-banner pattern elsewhere in the app) and stays
open so Claire can retry without re-picking the file.

## Testing

Manual verification in the browser (per project convention — no test suite exists):
import a CSV with new `sub_affiliate` values, confirm they appear as new rows in the
Store Directory; import a CSV containing a `sub_affiliate` that already exists with a
different store name, confirm the existing row updates rather than duplicating; import a
CSV missing the `Store Name` column, confirm the warning blocks import; import a row
with a blank or invalid Deployment Status, confirm it lands as "Not Deployed".
