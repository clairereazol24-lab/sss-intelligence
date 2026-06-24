# Marketing Efforts Deposit, Registration Relabel, and Report File Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Marketing Efforts page, relabel "Headcount" to "Registration", add a manual "Total Deposit" field, and let each entry attach a `.pdf`/`.docx` report file — then have the AI Report page read those attached files (PDFs natively, DOCX via text extraction) as part of its automatic overall analysis.

**Architecture:** The Marketing Efforts page gains a file input that uploads directly to a Supabase Storage bucket (`marketing-reports`, already created by Claire) using the existing `supabase-js` client, storing the resulting public URL alongside the entry. The AI Report API route, which already receives all `marketing_efforts` rows, fetches any attached file's bytes server-side at report-generation time: PDFs are passed to Claude as a native `document` content block, DOCX files have their text extracted via the `mammoth` npm package and folded into the prompt text.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client (`@supabase/supabase-js`, including Storage), Anthropic SDK (`@anthropic-ai/sdk`), `mammoth` (new dependency).

## Global Constraints

- Database already has the needed columns on `marketing_efforts` (`total_deposit NUMERIC DEFAULT 0`, `report_file_url TEXT`, `report_file_name TEXT`, `report_file_type TEXT`) and the Storage bucket `marketing-reports` (public) — both already applied directly in Supabase by Claire. Do not write migration code or attempt to create the bucket.
- Only `.pdf` and `.docx` files are accepted — no legacy `.doc`, no other file types. Reject anything else client-side before uploading.
- "Headcount" becomes "Registration" in the UI only — the underlying `headcount` field/column name does not change.
- `total_deposit` is a manually-typed number per entry (these are single-day events, not period aggregates — do not attempt to derive it from `performance_data`).
- The bucket is public and unauthenticated, consistent with the rest of this app having no auth — use a randomized file path (not the original filename) so URLs aren't easily guessable, but do not add any access-control code.
- If an attached file fails to fetch or parse during AI Report generation, skip that one file with a one-line warning folded into the prompt — never let one bad attachment block the whole report.
- No test suite exists in this repo — verify every change manually (curl + `tsc --noEmit` for backend/type checks; state plainly when a check requires a real browser and is therefore unverified).

---

### Task 1: Marketing Efforts page — Registration relabel, Total Deposit field, file upload, View Report link

**Files:**
- Modify: `app/marketing-efforts/page.tsx`

**Interfaces:**
- Produces: a POST body to `/api/marketing` that now includes `total_deposit` (number), `report_file_url` (string | null), `report_file_name` (string | null), `report_file_type` ('pdf' | 'docx' | null) alongside the existing fields. Task 2 (AI Report) consumes `marketing_efforts` rows containing these same field names.
- Consumes: `supabase.storage.from('marketing-reports')` — the bucket already exists in Supabase, created by Claire.

- [ ] **Step 1: Update the `Effort` type and add `supabase` import**

Find this block in `app/marketing-efforts/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

type Effort = {
  id: string
  date: string
  location: string
  store_name: string
  sub_affiliate: string
  activities_done: string
  headcount: number
  notes: string
}
```

Replace it with:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Effort = {
  id: string
  date: string
  location: string
  store_name: string
  sub_affiliate: string
  activities_done: string
  headcount: number
  total_deposit: number
  notes: string
  report_file_url: string | null
  report_file_name: string | null
  report_file_type: string | null
}
```

- [ ] **Step 2: Add file-upload state and a file-select handler**

Find this block in `app/marketing-efforts/page.tsx`:

```tsx
export default function MarketingEffortsPage() {
  const [efforts, setEfforts] = useState<Effort[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: '', location: '', store_name: '', sub_affiliate: '', activities_done: '', headcount: '', notes: '' })
  const [search, setSearch] = useState('')

  const fetchEfforts = async () => {
```

Replace it with:

```tsx
export default function MarketingEffortsPage() {
  const [efforts, setEfforts] = useState<Effort[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: '', location: '', store_name: '', sub_affiliate: '', activities_done: '', headcount: '', total_deposit: '', notes: '' })
  const [search, setSearch] = useState('')
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')

  const handleFileSelect = (f: File | null) => {
    setFileError('')
    if (!f) { setReportFile(null); return }
    const ext = f.name.toLowerCase().split('.').pop()
    if (ext !== 'pdf' && ext !== 'docx') {
      setFileError('Only .pdf and .docx files are supported.')
      setReportFile(null)
      return
    }
    setReportFile(f)
  }

  const fetchEfforts = async () => {
```

- [ ] **Step 3: Update `handleSave` to upload the file and send the new fields**

Find this block in `app/marketing-efforts/page.tsx`:

```tsx
  const handleSave = async () => {
    setSaving(true)
    await fetch('/api/marketing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, headcount: parseInt(form.headcount) || 0 }),
    })
    setSaving(false)
    setModal(false)
    setForm({ date: '', location: '', store_name: '', sub_affiliate: '', activities_done: '', headcount: '', notes: '' })
    fetchEfforts()
  }
```

Replace it with:

```tsx
  const handleSave = async () => {
    setSaving(true)

    let report_file_url: string | null = null
    let report_file_name: string | null = null
    let report_file_type: string | null = null

    if (reportFile) {
      const ext = reportFile.name.toLowerCase().split('.').pop()
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('marketing-reports').upload(path, reportFile)
      if (uploadError) {
        setFileError(`Upload failed: ${uploadError.message}`)
        setSaving(false)
        return
      }
      const { data: urlData } = supabase.storage.from('marketing-reports').getPublicUrl(path)
      report_file_url = urlData.publicUrl
      report_file_name = reportFile.name
      report_file_type = ext || null
    }

    await fetch('/api/marketing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        headcount: parseInt(form.headcount) || 0,
        total_deposit: parseFloat(form.total_deposit) || 0,
        report_file_url,
        report_file_name,
        report_file_type,
      }),
    })
    setSaving(false)
    setModal(false)
    setForm({ date: '', location: '', store_name: '', sub_affiliate: '', activities_done: '', headcount: '', total_deposit: '', notes: '' })
    setReportFile(null)
    setFileError('')
    fetchEfforts()
  }
```

- [ ] **Step 4: Update the table header and rows**

Find this block in `app/marketing-efforts/page.tsx`:

```tsx
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-gray-500 font-medium">Date</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Store</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Location</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Activities</th>
              <th className="px-4 py-3 text-gray-500 font-medium text-center">Headcount</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No entries yet. Add your first booth activation.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.date}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{e.store_name || '—'}</div>
                  {e.sub_affiliate && <div className="text-xs text-gray-400">{e.sub_affiliate}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600">{e.location || '—'}</td>
                <td className="px-4 py-3 text-gray-600 max-w-xs">
                  <p className="truncate">{e.activities_done || '—'}</p>
                </td>
                <td className="px-4 py-3 text-center font-medium text-gray-700">{e.headcount}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs">
                  <p className="truncate text-xs">{e.notes || '—'}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
```

Replace it with:

```tsx
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-gray-500 font-medium">Date</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Store</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Location</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Activities</th>
              <th className="px-4 py-3 text-gray-500 font-medium text-center">Registration</th>
              <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Notes</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Report</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No entries yet. Add your first booth activation.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.date}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{e.store_name || '—'}</div>
                  {e.sub_affiliate && <div className="text-xs text-gray-400">{e.sub_affiliate}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600">{e.location || '—'}</td>
                <td className="px-4 py-3 text-gray-600 max-w-xs">
                  <p className="truncate">{e.activities_done || '—'}</p>
                </td>
                <td className="px-4 py-3 text-center font-medium text-gray-700">{e.headcount}</td>
                <td className="px-4 py-3 text-right text-gray-700">₱{(e.total_deposit || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs">
                  <p className="truncate text-xs">{e.notes || '—'}</p>
                </td>
                <td className="px-4 py-3">
                  {e.report_file_url ? (
                    <a href={e.report_file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs whitespace-nowrap">📄 View Report</a>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
```

- [ ] **Step 5: Update the Add Entry modal form**

Find this block in `app/marketing-efforts/page.tsx`:

```tsx
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Date *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Headcount</label>
                  <input type="number" value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              {[
                { label: 'Store Name', key: 'store_name' },
                { label: 'Sub Affiliate ID', key: 'sub_affiliate' },
                { label: 'Location', key: 'location' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
                  <input value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Activities Done</label>
                <textarea value={form.activities_done} onChange={(e) => setForm({ ...form, activities_done: e.target.value })} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.date} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
            </div>
```

Replace it with:

```tsx
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Date *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Registration</label>
                  <input type="number" value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Total Deposit</label>
                <input type="number" value={form.total_deposit} onChange={(e) => setForm({ ...form, total_deposit: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {[
                { label: 'Store Name', key: 'store_name' },
                { label: 'Sub Affiliate ID', key: 'sub_affiliate' },
                { label: 'Location', key: 'location' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
                  <input value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Activities Done</label>
                <textarea value={form.activities_done} onChange={(e) => setForm({ ...form, activities_done: e.target.value })} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Report File (.pdf or .docx)</label>
                <input type="file" accept=".pdf,.docx" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} className="w-full text-sm" />
                {reportFile && <p className="text-xs text-gray-500 mt-1">Selected: {reportFile.name}</p>}
                {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => { setModal(false); setReportFile(null); setFileError('') }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.date} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
            </div>
```

- [ ] **Step 6: Verify with `tsc` and curl**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, upload a small test PDF directly to Supabase Storage via the REST API (this mimics what the browser's `supabase.storage.upload()` call does, without needing a browser):

```bash
echo "%PDF-1.4 test" > /tmp/test-report.pdf
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/marketing-reports/test-task1.pdf" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/test-report.pdf
```

(Read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local` in this worktree and substitute them, or `export` them first.)

Expected: a JSON response containing the uploaded object's `Key`. Then confirm the public URL is reachable:

```bash
curl -s -o /dev/null -w "%{http_code}" "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/marketing-reports/test-task1.pdf"
```

Expected: `200`.

Then verify the full entry round-trip through the app's own API:

```bash
curl -s -X POST "http://localhost:3000/api/marketing" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"2026-06-24\",\"location\":\"Test Mall\",\"store_name\":\"Test Store\",\"sub_affiliate\":\"test1\",\"activities_done\":\"Booth\",\"headcount\":10,\"total_deposit\":5000,\"notes\":\"test\",\"report_file_url\":\"$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/marketing-reports/test-task1.pdf\",\"report_file_name\":\"test-report.pdf\",\"report_file_type\":\"pdf\"}"
curl -s "http://localhost:3000/api/marketing" | grep -o '"sub_affiliate":"test1"[^}]*'
```

Expected: the second command's output shows `total_deposit:5000`, the same `report_file_url`, `report_file_name":"test-report.pdf"`, `report_file_type":"pdf"`.

State plainly in your report that the file-picker UI itself (selecting a file via the browser's native dialog, seeing "Selected: ..." appear, clicking Save and watching the row appear with a working "View Report" link) is **not verified** — there is no browser available in this environment, only the curl-based equivalent above.

- [ ] **Step 7: Commit**

```bash
git add app/marketing-efforts/page.tsx
git commit -m "Add Registration relabel, Total Deposit field, and report file upload to Marketing Efforts"
```

---

### Task 2: AI Report reads attached marketing report files

**Files:**
- Modify: `app/api/ai-report/route.ts`
- Modify: `package.json` (add `mammoth` dependency)

**Interfaces:**
- Consumes: `marketing_efforts` rows (from Task 1) containing `report_file_url`, `report_file_name`, `report_file_type` ('pdf' | 'docx' | null), passed into this route's existing `marketingData` request field — no change to the request shape from the AI Report page, which already sends the full row via `JSON.stringify({ performanceData: perfData, marketingData, period: 'all' })`.
- Produces: none new — final consumer in this plan.

- [ ] **Step 1: Install `mammoth`**

```bash
npm install mammoth
```

Run `npx tsc --noEmit` immediately after. If it reports missing type declarations for `mammoth` (e.g. "Could not find a declaration file for module 'mammoth'"), create `types/mammoth.d.ts` with:

```ts
declare module 'mammoth' {
  export function extractRawText(input: { buffer: Buffer }): Promise<{ value: string; messages: any[] }>
}
```

and re-run `npx tsc --noEmit` to confirm it's now clean. If `mammoth` already ships usable types, skip creating this file.

- [ ] **Step 2: Replace the route to switch runtime and read attached files**

Find this block in `app/api/ai-report/route.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { performanceData, marketingData, period } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const totalDeposit = performanceData.reduce((s: number, r: any) => s + r.total_deposit, 0)
    const totalGGR = performanceData.reduce((s: number, r: any) => s + r.company_net_win, 0)
    const totalStores = performanceData.length
    const activeStores = performanceData.filter((r: any) => r.total_deposit > 0).length
    const zeroStores = performanceData.filter((r: any) => r.total_deposit === 0).length
    const negativeGGR = performanceData.filter((r: any) => r.company_net_win < 0)

    const prompt = `You are the LakiWin Store Intelligence Engine. Analyze the store performance data below and produce a structured intelligence report.

PERIOD: ${period}
TOTAL STORES: ${totalStores} | ACTIVE: ${activeStores} | ZERO ACTIVITY: ${zeroStores}
TOTAL DEPOSITS: ₱${totalDeposit.toLocaleString()} | TOTAL GGR: ₱${totalGGR.toLocaleString()}
NEGATIVE GGR STORES: ${negativeGGR.map((r: any) => r.store_name).join(', ') || 'None'}

PERFORMANCE DATA (JSON):
${JSON.stringify(performanceData, null, 2)}

${marketingData && marketingData.length > 0 ? `MARKETING EFFORTS DATA:
${JSON.stringify(marketingData, null, 2)}` : 'MARKETING EFFORTS: No data for this period.'}

Produce this exact structured report:

## 1. EXECUTIVE SUMMARY
Summarize system-wide status. Total GGR, total deposits, active vs inactive store ratio. Flag any critical issues.

## 2. FUNNEL ANALYSIS
Break down: Registered Members → First Deposit → Active Depositors → Effective Members.
Show conversion rates. Identify where members are dropping off.

## 3. KEY INSIGHTS
3-5 specific insights with store names and numbers. What is working, what is failing.

## 4. STORE SEGMENTATION

**SCALE (Top Performers):**
List stores with highest deposits + positive GGR. Include deposit amount and GGR.

**MAINTAIN (Mid Performers):**
Stores with moderate activity. Include what to watch.

**FIX (Underperformers):**
Stores with zero activity, negative GGR, or high withdrawals vs deposits. Be specific.

## 5. PARTNER ANALYSIS
Compare Relevant Tech vs Alpharus (if both present). Store count, total deposits, total GGR, avg per store.

## 6. MISSING ACTIONS
Flag specifically:
- Stores with registered members but ZERO deposits
- Stores with no activity entire period
- Stores where withdrawals significantly exceed deposits (ratio > 1.5x)
- Stores with high deposits but negative GGR

## 7. MARKETING EFFORT IMPACT
If marketing data exists: match booth activations to stores and show performance correlation.
If no data: note what marketing data would help here.

## 8. MARKETING SUGGESTIONS PER STORE
For each FIX store and selected MAINTAIN stores, give one specific actionable marketing suggestion. Format:
- [Store Name]: [Specific action]

## 9. RECOMMENDATIONS
**IMMEDIATE (0-7 days):** Top 3 actions
**MID-TERM (1-4 weeks):** Top 3 strategies
**SCALING:** Which stores to invest more in and why

RULES: Every insight must name specific stores. No generic advice. Flag suspicious patterns. Prioritize by GGR impact.`

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
```

Replace it with:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import mammoth from 'mammoth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { performanceData, marketingData, period } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const totalDeposit = performanceData.reduce((s: number, r: any) => s + r.total_deposit, 0)
    const totalGGR = performanceData.reduce((s: number, r: any) => s + r.company_net_win, 0)
    const totalStores = performanceData.length
    const activeStores = performanceData.filter((r: any) => r.total_deposit > 0).length
    const zeroStores = performanceData.filter((r: any) => r.total_deposit === 0).length
    const negativeGGR = performanceData.filter((r: any) => r.company_net_win < 0)

    // Read attached marketing report files: PDFs are passed to Claude natively as
    // document blocks; DOCX files have their text extracted server-side since
    // Claude has no native DOCX reader.
    const pdfBlocks: any[] = []
    let docxText = ''
    const fileWarnings: string[] = []

    for (const m of marketingData || []) {
      if (!m.report_file_url) continue
      const label = `${m.store_name || m.sub_affiliate || 'Unknown store'} (${m.date})`
      try {
        const res = await fetch(m.report_file_url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buffer = Buffer.from(await res.arrayBuffer())

        if (m.report_file_type === 'pdf') {
          pdfBlocks.push({ type: 'text', text: `Attached report for ${label}:` })
          pdfBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
          })
        } else if (m.report_file_type === 'docx') {
          const { value } = await mammoth.extractRawText({ buffer })
          docxText += `\n\nATTACHED REPORT for ${label}:\n${value}`
        }
      } catch (err: any) {
        fileWarnings.push(`Note: could not read attached report for ${label} (${err.message})`)
      }
    }

    const prompt = `You are the LakiWin Store Intelligence Engine. Analyze the store performance data below and produce a structured intelligence report.

PERIOD: ${period}
TOTAL STORES: ${totalStores} | ACTIVE: ${activeStores} | ZERO ACTIVITY: ${zeroStores}
TOTAL DEPOSITS: ₱${totalDeposit.toLocaleString()} | TOTAL GGR: ₱${totalGGR.toLocaleString()}
NEGATIVE GGR STORES: ${negativeGGR.map((r: any) => r.store_name).join(', ') || 'None'}

PERFORMANCE DATA (JSON):
${JSON.stringify(performanceData, null, 2)}

${marketingData && marketingData.length > 0 ? `MARKETING EFFORTS DATA:
${JSON.stringify(marketingData, null, 2)}` : 'MARKETING EFFORTS: No data for this period.'}
${docxText}
${fileWarnings.length > 0 ? `\n\n${fileWarnings.join('\n')}` : ''}

Produce this exact structured report:

## 1. EXECUTIVE SUMMARY
Summarize system-wide status. Total GGR, total deposits, active vs inactive store ratio. Flag any critical issues.

## 2. FUNNEL ANALYSIS
Break down: Registered Members → First Deposit → Active Depositors → Effective Members.
Show conversion rates. Identify where members are dropping off.

## 3. KEY INSIGHTS
3-5 specific insights with store names and numbers. What is working, what is failing.

## 4. STORE SEGMENTATION

**SCALE (Top Performers):**
List stores with highest deposits + positive GGR. Include deposit amount and GGR.

**MAINTAIN (Mid Performers):**
Stores with moderate activity. Include what to watch.

**FIX (Underperformers):**
Stores with zero activity, negative GGR, or high withdrawals vs deposits. Be specific.

## 5. PARTNER ANALYSIS
Compare Relevant Tech vs Alpharus (if both present). Store count, total deposits, total GGR, avg per store.

## 6. MISSING ACTIONS
Flag specifically:
- Stores with registered members but ZERO deposits
- Stores with no activity entire period
- Stores where withdrawals significantly exceed deposits (ratio > 1.5x)
- Stores with high deposits but negative GGR

## 7. MARKETING EFFORT IMPACT
If marketing data exists: match booth activations to stores and show performance correlation.
If no data: note what marketing data would help here.

## 8. MARKETING SUGGESTIONS PER STORE
For each FIX store and selected MAINTAIN stores, give one specific actionable marketing suggestion. Format:
- [Store Name]: [Specific action]

## 9. RECOMMENDATIONS
**IMMEDIATE (0-7 days):** Top 3 actions
**MID-TERM (1-4 weeks):** Top 3 strategies
**SCALING:** Which stores to invest more in and why

RULES: Every insight must name specific stores. No generic advice. Flag suspicious patterns. Prioritize by GGR impact.`

    const content: any[] = [{ type: 'text', text: prompt }, ...pdfBlocks]

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
```

- [ ] **Step 3: Verify with `tsc`**

Run `npx tsc --noEmit` — expect zero errors. If the Anthropic SDK's TypeScript types reject the `document` content block type (e.g. "Object literal may only specify known properties"), check the installed SDK version with `npm ls @anthropic-ai/sdk` and, if it's old, run `npm install @anthropic-ai/sdk@latest` then re-run `npx tsc --noEmit`. PDF document support requires a reasonably current SDK version.

- [ ] **Step 4: Verify end-to-end with curl, using the PDF uploaded in Task 1**

With `npm run dev` running, and reusing the `test-task1.pdf` file already uploaded to the `marketing-reports` bucket in Task 1 (re-upload it if it's no longer present, using the same curl command from Task 1 Step 6):

```bash
curl -s -X POST "http://localhost:3000/api/ai-report" \
  -H "Content-Type: application/json" \
  -d "{\"performanceData\":[{\"sub_affiliate\":\"test1\",\"store_name\":\"Test Store\",\"total_deposit\":1000,\"company_net_win\":200,\"period\":\"2026-06\"}],\"marketingData\":[{\"store_name\":\"Test Store\",\"sub_affiliate\":\"test1\",\"date\":\"2026-06-24\",\"report_file_url\":\"$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/marketing-reports/test-task1.pdf\",\"report_file_type\":\"pdf\"}],\"period\":\"all\"}" \
  --max-time 60
```

Expected: a streamed text response (the report) with HTTP 200 — not a 500 JSON error. A minimal/garbage PDF like the one created in Task 1 may make Claude's analysis of its *content* trivial or note it's unreadable, which is fine — the goal of this check is confirming the route doesn't crash when given a real `report_file_url`/`report_file_type: 'pdf'` pair, not validating the AI's interpretation of placeholder content.

Also verify the no-attachment path still works (regression check):

```bash
curl -s -X POST "http://localhost:3000/api/ai-report" \
  -H "Content-Type: application/json" \
  -d '{"performanceData":[{"sub_affiliate":"test1","store_name":"Test Store","total_deposit":1000,"company_net_win":200,"period":"2026-06"}],"marketingData":[],"period":"all"}' \
  --max-time 60
```

Expected: also a streamed text response with HTTP 200.

State plainly in your report that this confirms the route doesn't error on either path; it does not confirm the *quality* of Claude's reading of a real-world PDF/DOCX report, since no real report file was available to test with.

- [ ] **Step 5: Commit**

```bash
git add app/api/ai-report/route.ts package.json package-lock.json
git commit -m "AI Report reads attached marketing report PDFs and DOCX files"
```
