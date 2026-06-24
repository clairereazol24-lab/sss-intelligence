# Marketing Efforts: Registration Relabel, Total Deposit, and Report File Upload

## Problem

The Marketing Efforts page tracks booth activations and field activities, one entry
per single-day event. Three gaps:

1. The "Headcount" field is labeled wrong — it actually represents registrations
   captured during the activation, not foot traffic.
2. There's no way to record the deposit total tied to a specific activation. Since
   each entry is a single-day event (unlike performance data, which is uploaded in
   monthly/daily bulk periods), this can't be reliably derived by joining to
   `performance_data` — it needs to be entered directly.
3. There's no way to attach the underlying report document (PDF or Word) for an
   activation, and no way for the AI Report to read it as part of its overall
   analysis.

## Goals

- Relabel "Headcount" to "Registration" everywhere it appears in the UI (table
  header, form label). No database column rename.
- Add a manual "Total Deposit" number field to each marketing effort entry.
- Add a file attachment to each entry, accepting `.pdf` and `.docx` only, stored in
  a public Supabase Storage bucket (`marketing-reports`, already created), with a
  "📄 View Report" link in the table when a file is attached.
- When the AI Report page auto-generates its report, any attached files are read
  and factored into the analysis: PDFs are passed directly to Claude as a native
  document; `.docx` files have their text extracted server-side and included in
  the prompt.

## Non-goals

- No bulk upload of marketing entries or their files — one file per entry, attached
  through the existing Add Entry flow.
- No support for legacy `.doc` (Word 97-2003) — `.docx` only.
- No private/signed-URL storage — the bucket is public, consistent with the rest of
  this app having no auth.
- No editing of an existing entry's attached file in this pass (replacing or
  removing a file after upload) — only attaching one at creation time.
- No change to the single-store Add/Edit modal on Store Directory, or to the SSS
  Data upload flow — this is scoped entirely to Marketing Efforts and AI Report.

## Design

### Database

Two already-applied changes (run directly by Claire in Supabase, not part of this
plan's tasks):
- Storage bucket `marketing-reports`, public, accepting `application/pdf` and
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- `marketing_efforts` gained four columns: `total_deposit NUMERIC DEFAULT 0`,
  `report_file_url TEXT`, `report_file_name TEXT`, `report_file_type TEXT`.

### Marketing Efforts page (`app/marketing-efforts/page.tsx`)

- Table header "Headcount" → "Registration"; form label "Headcount" → "Registration"
  (the underlying `headcount` field/column name is unchanged).
- New "Total Deposit" column in the table, formatted as currency (₱, matching the
  rest of the app's number formatting); new number input in the Add Entry form.
- New file input in the Add Entry form, `accept=".pdf,.docx"`. On Save, if a file is
  selected: upload it to the `marketing-reports` bucket via the Supabase JS client
  (`supabase.storage.from('marketing-reports').upload(...)`) using a randomized
  path (e.g. a UUID-prefixed filename, to avoid collisions and avoid leaking
  guessable URLs for a public bucket), then get its public URL
  (`getPublicUrl`) and include `report_file_url`, `report_file_name` (the
  original filename), and `report_file_type` (`'pdf'` or `'docx'`, derived from
  the file extension) in the POST body to `/api/marketing` alongside the other
  fields.
- Table row shows a "📄 View Report" link (opens `report_file_url` in a new tab)
  when `report_file_url` is set; otherwise nothing in that cell.
- Client-side validation: reject any file that isn't `.pdf` or `.docx` before
  attempting upload (extension check), with an inline error message in the modal.

### Marketing API (`app/api/marketing/route.ts`)

No structural change — `POST` already does `supabase.from('marketing_efforts').insert(body)`,
and the new fields ride along in `body` once the page sends them. Confirmed by
reading the current route: it does not allowlist fields, so no route change is
needed for the new columns to persist.

### AI Report (`app/api/ai-report/route.ts`)

This route currently declares `export const runtime = 'edge'`. `mammoth` depends
on Node.js built-ins the Edge runtime doesn't provide, so this line must change to
`export const runtime = 'nodejs'` (the Next.js default serverless runtime, which
still supports streaming `Response` bodies the same way) as part of this work.

Currently the route receives `marketingData` (the raw rows from
`marketing_efforts`) and JSON-stringifies them straight into the prompt. This
needs to change to:

1. For each marketing effort row with `report_file_url` set:
   - If `report_file_type === 'pdf'`: fetch the file's bytes from
     `report_file_url`, base64-encode them, and add a `document` content block
     (`{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: <base64> } }`)
     to the user message sent to Claude, labeled (via an adjacent `text` block)
     with which store/date/location it came from.
   - If `report_file_type === 'docx'`: fetch the file's bytes, extract text using
     the `mammoth` npm package (`mammoth.extractRawText({ buffer })`), and append
     the extracted text to the prompt's marketing section, labeled with which
     store/date/location it came from.
2. The existing `marketingData` JSON block in the prompt stays as-is (it already
   carries `total_deposit` and the relabeled-in-UI-only `headcount` field, since
   those are just data columns) — the attached-file content is additive context
   on top of that, not a replacement.
3. If fetching or parsing a given file fails (network error, corrupt file), skip
   that one file, note its store/date in a one-line warning appended to the
   prompt (e.g. "Note: could not read attached report for <store> on <date>"),
   and continue with the rest of the report — one bad attachment must not block
   the whole report from generating.

### New dependency

- `mammoth` (`.docx` → plain text extraction), added to `package.json` dependencies.

## Testing

Manual verification (per project convention — no test suite exists):
- Add a marketing entry with no file attached — confirm it still saves and
  displays correctly (Total Deposit shows, Registration label shows, no "View
  Report" link).
- Add an entry with a `.pdf` attached — confirm upload succeeds, "View Report"
  link opens the correct file, and the next AI Report generation includes
  content clearly drawn from that PDF (e.g. ask it to mention a distinctive
  detail only present in the test PDF).
- Add an entry with a `.docx` attached — same check, confirming extracted text
  reaches the AI Report.
- Attempt to attach a `.txt` or `.jpg` file — confirm the inline validation error
  blocks the upload before it reaches Supabase Storage.
- Manually corrupt or break one file's URL after upload (e.g. test against a
  deleted file) and confirm the AI Report still generates a full report with
  only a one-line warning, not a hard failure.
