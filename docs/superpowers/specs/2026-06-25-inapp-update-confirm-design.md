# Replace window.confirm() with In-App Confirm Step

## Problem

The "Update File" mode (added 2026-06-25 for SSS Data and Store Directory imports) gates its destructive submit behind `window.confirm()`. That's a native OS/browser dialog — it doesn't match the app's styling and looks like "an outside notification" rather than part of the system.

## Behavior

Replace `window.confirm()` in both `app/sss-data/page.tsx` and `app/store-directory/page.tsx` with an inline two-step footer inside the same import modal — no new overlay, no second modal.

- New state: `confirming` (SSS Data) / `bulkConfirming` (Store Directory), boolean, default `false`.
- The existing upload handler splits into a click-gate and the actual upload:
  - **Click-gate** (`handleUploadClick` / `handleBulkImportClick`): runs the existing validation (period/month checks for SSS Data; `subAffiliateKey`/`storeNameKey` check for Store Directory, already present). If `mode === 'update'` (or `bulkMode === 'update'`) and `confirming`/`bulkConfirming` is `false`, set it to `true` and return — do not upload yet. Otherwise (mode is `'new'`, or already confirming), call the actual upload function.
  - **Actual upload** (`performUpload` / `performBulkImport`): the existing fetch/response logic, unchanged, minus the old `window.confirm` check. Always resets `confirming`/`bulkConfirming` to `false` at the start of the call (covers both the success and error paths, so a failed attempt re-shows the explicit confirm step on retry).
- Footer rendering:
  - **Not confirming**: unchanged — gray "Cancel" button (closes the modal, existing `handleCancel`/`handleBulkCancel`), blue primary button labeled `Upload N Records` / `Import N Stores`, calling the click-gate.
  - **Confirming**: the left button's label stays "Cancel" but its action changes to stepping back (`setConfirming(false)` / `setBulkConfirming(false)`) rather than closing the modal — same semantic as dismissing `window.confirm` today (it aborted the upload attempt, not the whole modal). The right button turns red and reads "Yes, Replace Data" (SSS Data) / "Yes, Replace Directory" (Store Directory), calling the click-gate again (which now proceeds to the actual upload since `confirming`/`bulkConfirming` is `true`).
- `confirming`/`bulkConfirming` also resets to `false` when either toggle button ("New Upload" / "Update File") is clicked, and inside `handleCancel`/`handleBulkCancel` (modal close).
- The existing static amber warning under the Upload Mode toggle is unchanged — no second/duplicate warning banner is added for the confirm step. The button turning red and changing label is the only new "are you sure" signal.

## No backend changes

This is UI-only. The `mode`/`removed` API contract added 2026-06-25 (`/api/upload`, `/api/stores/bulk`) is unchanged.

## Error handling

Identical to today: errors still render in the existing red error banner (`error`/`bulkError`). The only change is that `confirming`/`bulkConfirming` is always reset to `false` when an upload attempt starts, so after an error the user sees the normal (non-confirming) footer and must explicitly re-trigger the confirm step to retry an Update File submission.

## Testing

No automated test suite in this project. Manual verification:

1. Open the SSS Data import modal, select **Update File**. Click "Upload N Records" — confirm the footer swaps in place: "Cancel" stays where it is, the primary button turns red and reads "Yes, Replace Data", with no new banner appearing.
2. Click "Cancel" in the confirming state — confirm the footer reverts to the normal blue "Upload N Records" button, and the modal stays open with the file still loaded (not closed).
3. Click "New Upload" while confirming — confirm it resets to the normal footer for the 'new' mode (no confirm step ever shown for New Upload).
4. Repeat steps 1-3 for the Store Directory Bulk Import modal ("Yes, Replace Directory" wording).
5. Using a disposable test period (e.g. year 2099) for SSS Data, or following the backup/restore safety procedure for Store Directory if exercising the real delete path against live data — click "Yes, Replace Data"/"Yes, Replace Directory" and confirm the upload proceeds and the existing success/result messaging (with the `removed` count) still appears correctly.
6. `npx tsc --noEmit` and `npm run build` both pass with no errors.
