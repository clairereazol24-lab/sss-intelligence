# Store Directory: Success Message for New Upload

## Problem

`performBulkImport`'s success branch only sets `bulkResult` (the green success banner) when `bulkMode === 'update'`. New Upload mode imports silently — the modal just closes and the table refreshes, with no confirmation shown. SSS Data already shows a success message for both modes; Store Directory should match.

## Behavior

In `app/store-directory/page.tsx`, `performBulkImport`'s success branch always sets `bulkResult`, with wording based on `wasUpdateMode`:

- **New Upload:** `✅ Successfully imported {count} stores.`
- **Update File** (unchanged): `✅ Directory updated: {count} stores upserted, {removed} removed.`

No other behavior changes — same banner placement (`{bulkResult && <div className="bg-green-50 ...">}`), same `handleBulkCancel()` and `fetchStores()` calls, no backend changes.

## Testing

No automated test suite. Manual: `npx tsc --noEmit`, `npm run build`, then bulk-import a CSV in New Upload mode and confirm the green success banner now appears with the new wording; re-confirm Update File mode's message is unchanged.
