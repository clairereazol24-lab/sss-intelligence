# Upload Mode: New Upload vs Update File

## Problem

Re-uploading a CSV on SSS Data or Store Directory already upserts matching rows, but rows missing from the new file are left behind. There's no way to fully replace a period's data (SSS Data) or the whole directory (Store Directory) when a corrected file is provided — stale rows from the old file linger.

## Behavior

Both import flows get a **New Upload / Update File** toggle, defaulting to **New Upload** (today's behavior, unchanged).

### SSS Data

- **New Upload**: upsert the file's rows into `performance_data` keyed on `(sub_affiliate, period)`, and upsert `stores` from the file's rows. (Unchanged.)
- **Update File**: same upsert, then delete any `performance_data` row where `period` and `period_type` match the selected period but `sub_affiliate` is not present in the uploaded file. Scope is limited to the selected period — other periods are untouched.

### Store Directory

- **New Upload**: upsert the file's rows into `stores` keyed on `sub_affiliate`. (Unchanged.)
- **Update File**: same upsert, then delete any `stores` row whose `sub_affiliate` is not present in the uploaded file. Scope is the entire directory — the uploaded file becomes the full source of truth for `stores`.

### Shared rules

- Order is always **upsert first, delete second**. If the upsert fails, the request errors out before any delete runs, so a bad file can never wipe out good data.
- Server rejects Update File requests with zero rows (`records`/`stores` empty) — an empty file in Update mode would otherwise delete everything in scope.
- Delete calls use `.select()` so the response can report how many rows were removed.

## UI

Both import modals (`app/sss-data/page.tsx`, `app/store-directory/page.tsx`) get a mode toggle styled like the existing Monthly/Daily toggle on SSS Data:

```
[ New Upload ]  [ Update File ]
```

- Default selection: **New Upload**.
- When **Update File** is selected, show an inline amber warning directly below the toggle:
  - SSS Data: "This will replace data for the selected period — any store missing from this file will be removed from that period."
  - Store Directory: "This will replace the entire Store Directory — any store missing from this file will be deleted."
- On submit while in Update mode, show a `window.confirm()` with the same warning text before the request fires. Cancelling aborts the submit; nothing is sent.
- Success message reports both counts:
  - SSS Data: `✅ Updated period 2026-06: 42 records upserted, 3 removed.` (New Upload mode keeps today's message: `✅ Successfully uploaded 42 store records for period: 2026-06`)
  - Store Directory: after a successful Update File import, show a result banner (new — today's bulk import has no success message, it just closes the modal and refreshes the list): `✅ Directory updated: 42 stores upserted, 3 removed.` New Upload mode keeps today's behavior (silent close + refresh).

## API

### `POST /api/upload` (SSS Data)

- Request body gains `mode: 'new' | 'update'`, optional, defaults to `'new'`.
- Validation: if `mode === 'update'` and `records.length === 0`, return 400 `{ error: 'Cannot update with an empty file.' }`.
- After the existing `performance_data` upsert succeeds, if `mode === 'update'`:
  ```ts
  const uploadedIds = records.map(r => r.sub_affiliate)
  const { data: removed } = await supabase
    .from('performance_data')
    .delete()
    .eq('period', period)
    .eq('period_type', periodType)
    .not('sub_affiliate', 'in', `(${uploadedIds.map(id => `"${id}"`).join(',')})`)
    .select()
  ```
- Response gains `removed: removed?.length || 0` (always present, `0` for New Upload).

### `POST /api/stores/bulk` (Store Directory)

- Request body gains `mode: 'new' | 'update'`, optional, defaults to `'new'`.
- Validation: if `mode === 'update'` and `stores.length === 0`, return 400 `{ error: 'Cannot update with an empty file.' }`.
- After the existing `stores` upsert succeeds, if `mode === 'update'`:
  ```ts
  const uploadedIds = stores.map(s => s.sub_affiliate)
  const { data: removed } = await supabase
    .from('stores')
    .delete()
    .not('sub_affiliate', 'in', `(${uploadedIds.map(id => `"${id}"`).join(',')})`)
    .select()
  ```
- Response gains `removed: removed?.length || 0`.

## Error handling

- Upsert failure: existing try/catch returns 500 with the error message; no delete is attempted (delete code only runs after the upsert call returns without throwing).
- Delete failure: surfaces as a 500 with the error message via the same catch block; the upsert has already committed by this point, so the new/corrected rows are safe even if cleanup fails partway.
- Empty-file-in-update-mode guard runs before any DB call.

## Testing

No automated test suite in this project (`npm run build` is the only check). Manual verification:

1. **SSS Data — New Upload**: upload a period twice with an extra store the second time; confirm both old and new stores remain (today's behavior, unchanged).
2. **SSS Data — Update File**: upload a period, then re-upload Update File with one store removed from the CSV; confirm that store's row for that period is deleted, other periods for that store are untouched, and the success message shows the removed count.
3. **SSS Data — Update File, empty CSV**: confirm the API rejects with the empty-file error and no rows are deleted.
4. **Store Directory — New Upload**: bulk import twice with an extra store the second time; confirm both remain.
5. **Store Directory — Update File**: bulk import, then re-import Update File with one store removed; confirm that store is deleted from `stores`, the success banner shows the removed count, and existing `performance_data` history for that store is untouched (no FK cascade).
6. **Cancel confirm dialog**: select Update File, click submit, cancel the `window.confirm`; confirm no request is sent and the modal stays open.
7. `npm run build` passes with no TypeScript errors.
