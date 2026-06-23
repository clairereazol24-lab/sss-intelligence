# SSS Data Page: Import Flow in a Modal

## Problem

After picking a file via the Import button, the SSS Data page currently reveals four
sections inline, stacked below the Overall card and Store Summary table: column
warnings, the Monthly/Daily period picker, a preview table, and the Upload button.
Claire wants this whole flow moved into a modal instead, so it doesn't push the rest of
the page down. Separately, the Preview table's Partner/DSP columns have the same
case-sensitivity bug that was already fixed for the actual upload — they show "—" for
files whose header casing doesn't exactly match `Partner`/`DSP` (e.g. `Dsp`), even though
the real upload now reads those columns correctly.

## Goals

- After a file is selected and parsed, column warnings, the period picker, the preview
  table, and the Upload button render inside a modal instead of inline on the page.
- A "Cancel" button in the modal clears the selected file/parsed state and closes the
  modal without uploading.
- On a successful upload, the modal closes automatically (since the existing code already
  clears `parsed` on success) and the success message shows on the page underneath, same
  as today.
- The error banner moves into the modal, since it's only relevant while the modal is open.
- Fix the Preview table's Partner/DSP columns to use the same case-insensitive header
  matching already used for the real upload.

## Non-goals

- No change to the upload logic itself (`handleUpload`, `getPeriod`, the validation that
  requires a month to be selected) — only where these steps are *displayed*.
- No backdrop-click-to-close — matches the existing modal convention used elsewhere in
  this app (Store Directory, Marketing Efforts), which only closes via an explicit button.
- No change to the Overall card, Store Summary table, Import/Export buttons, or the
  From/To date filter — those stay exactly as they are, outside the modal.

## Design

### Data flow

No change to any state's *meaning* — `file`, `parsed`, `headers`, `hasPartner`, `hasDSP`,
`periodType`, `month`, `year`, `date`, `error`, `uploading` all keep their current
purpose. What changes is which JSX block they render into, and one new behavior: a
"Cancel" handler that resets `file`, `parsed`, `headers`, `hasPartner`, `hasDSP`, `error`,
and the file input ref's value — equivalent to what already happens after a successful
upload, minus the success message.

The Preview table currently reads `row['Partner']` / `row['DSP']` directly. It switches
to the same `partnerKey`/`dspKey` case-insensitive lookup already computed inside
`handleUpload` — that computation moves up to where `headers` is available for both the
Preview table and `handleUpload` to share, rather than being duplicated.

### UI layout

The modal opens whenever `parsed.length > 0` (the same condition that already gates all
four of these sections today). It follows the existing modal convention used elsewhere in
the app: a dark overlay (`fixed inset-0 bg-black/40 flex items-center justify-center
z-50`) behind a white rounded panel (`max-w-3xl w-full max-h-[90vh] overflow-y-auto`,
scrollable since the preview table can be tall).

Inside the panel, top to bottom: column warnings (Partner/DSP detection), the "Select
Period" section (Monthly/Daily toggle + month/year or date input), the "Preview (N rows)"
table, the error banner (if `error` is set), and a bottom button row — "Cancel" on the
left, "Upload N Records" (the existing primary button, unchanged styling) on the right —
matching the Cancel/Save button placement already used in the Store Directory modal.

### Error handling

Unchanged mechanism — `error` is still set the same way by `handleUpload` — only its
render location moves from the page into the modal. The success `result` banner stays
where it is today, rendered on the page (not in the modal), since it only ever becomes
visible after `parsed` is cleared and the modal has already closed.

## Testing

Manual verification in the browser (per project convention — no test suite exists):
select a CSV, confirm the modal opens with column warnings, period picker, and preview
all visible inside it; confirm a CSV with a `Dsp` (mixed-case) column now shows real DSP
values in the Preview table instead of "—"; click Cancel, confirm the modal closes and
the page returns to its pre-selection state with no file selected; select a file again,
pick a period, click Upload, confirm the modal closes automatically on success and the
green success message appears on the page; trigger an upload error (e.g. no month
selected) and confirm the error banner appears inside the still-open modal.
