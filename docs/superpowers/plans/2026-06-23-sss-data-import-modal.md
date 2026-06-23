# SSS Data Import Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the column-warnings/period-picker/preview/upload-button flow into a modal on the SSS Data page, and fix the Preview table's case-sensitive Partner/DSP column lookup.

**Architecture:** A single JSX restructuring in `app/sss-data/page.tsx`: the four sections currently gated by `parsed.length > 0` and rendered inline move into a modal overlay gated by the same condition. A new `handleCancel` resets the file/parsed state without uploading. `partnerKey`/`dspKey` (currently computed only inside `handleUpload`) become component-level derived values so both `handleUpload` and the Preview table can use the same case-insensitive lookup.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually (browser/tsc).
- No change to `handleUpload`'s upload logic, `getPeriod`, or the month-selection validation — only where these steps are displayed changes.
- No backdrop-click-to-close — matches the existing modal convention in `app/store-directory/page.tsx` (Cancel/primary-button row, no close-on-outside-click).
- The Overall card, Store Summary table, Import/Export buttons, and From/To date filter are untouched — they stay outside the modal exactly as they are today.
- The success `result` banner stays rendered on the page (not inside the modal) — it only becomes visible after `parsed` is cleared, by which point the modal has already closed.

---

### Task 1: Move the import flow into a modal, fix Preview table's Partner/DSP lookup

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Produces: none new — this is a self-contained UI restructuring with no external interface.

- [ ] **Step 1: Add `handleCancel`, remove the duplicate `partnerKey`/`dspKey` computation from `handleUpload`**

Find this block in `app/sss-data/page.tsx`:

```ts
  const handleUpload = async () => {
    if (!parsed.length) return
    if (periodType === 'monthly' && !month) {
      setError('Please select a month before uploading.')
      return
    }
    const period = getPeriod()
    if (!period || period.includes('undefined') || period === '-') {
      setError('Please select a valid period.')
      return
    }
    setUploading(true)
    setError(null)

    const partnerKey = headers.find(h => h.toLowerCase() === 'partner')
    const dspKey = headers.find(h => h.toLowerCase() === 'dsp')

    const records = parsed.map((row: any) => ({
```

Replace it with:

```ts
  const handleCancel = () => {
    setFile(null)
    setParsed([])
    setHeaders([])
    setHasPartner(false)
    setHasDSP(false)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleUpload = async () => {
    if (!parsed.length) return
    if (periodType === 'monthly' && !month) {
      setError('Please select a month before uploading.')
      return
    }
    const period = getPeriod()
    if (!period || period.includes('undefined') || period === '-') {
      setError('Please select a valid period.')
      return
    }
    setUploading(true)
    setError(null)

    const records = parsed.map((row: any) => ({
```

- [ ] **Step 2: Add component-level `partnerKey`/`dspKey` derived values**

Find this block in `app/sss-data/page.tsx`:

```ts
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const formatLastUpdated = (lu: LastUpdated | null) => {
```

Replace it with:

```ts
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const partnerKey = headers.find(h => h.toLowerCase() === 'partner')
  const dspKey = headers.find(h => h.toLowerCase() === 'dsp')

  const formatLastUpdated = (lu: LastUpdated | null) => {
```

- [ ] **Step 3: Replace the inline Column warnings/Period/Preview/Upload sections with a modal**

Find this block in `app/sss-data/page.tsx` (it runs from the Column warnings comment through the end of the component):

```tsx
      {/* Column warnings */}
      {parsed.length > 0 && (
        <div className="mb-4 space-y-2">
          {!hasPartner && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>Partner</strong> column detected. Add it to your CSV before uploading.</div>}
          {!hasDSP && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>DSP</strong> column detected. Add it to your CSV before uploading.</div>}
          {hasPartner && hasDSP && <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg">✅ Partner and DSP columns detected.</div>}
        </div>
      )}

      {/* Period selector */}
      {parsed.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="font-semibold text-gray-700 mb-3">Select Period</h2>
          <div className="flex gap-4 mb-4">
            <button onClick={() => setPeriodType('monthly')} className={`px-4 py-2 rounded-lg text-sm font-medium ${periodType === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Monthly</button>
            <button onClick={() => setPeriodType('daily')} className={`px-4 py-2 rounded-lg text-sm font-medium ${periodType === 'daily' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Daily</button>
          </div>
          {periodType === 'monthly' ? (
            <div className="flex gap-3">
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Month</option>
                {months.map((m, i) => <option key={m} value={m}>{monthNames[i]}</option>)}
              </select>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {['2024','2025','2026','2027'].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : (
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          )}
        </div>
      )}

      {/* Preview */}
      {parsed.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="font-semibold text-gray-700 mb-3">Preview ({parsed.length} rows)</h2>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-gray-50">
                  {['Sub Affiliate', 'Sub Affiliate Name', 'Total Deposit', 'Company Net Win (GGR)', 'Partner', 'DSP'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{row['Sub Affiliate']}</td>
                    <td className="px-3 py-2 text-gray-700">{row['Sub Affiliate Name']}</td>
                    <td className="px-3 py-2 text-gray-700">{row['Total Deposit']}</td>
                    <td className="px-3 py-2 text-gray-700">{row['Company Net Win (GGR)']}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${row['Partner'] ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-500'}`}>{row['Partner'] || '—'}</span></td>
                    <td className="px-3 py-2 text-gray-700">{row['DSP'] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 10 && <p className="text-xs text-gray-400 mt-2">Showing 10 of {parsed.length} rows</p>}
          </div>
        </div>
      )}

      {result && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm">{result}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm">❌ {error}</div>}

      {parsed.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          {uploading ? 'Uploading...' : `Upload ${parsed.length} Records`}
        </button>
      )}
    </div>
  )
}
```

Replace it with:

```tsx
      {result && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm">{result}</div>}

      {parsed.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="font-bold text-gray-800 mb-4">Import {file?.name}</h2>

            {/* Column warnings */}
            <div className="mb-4 space-y-2">
              {!hasPartner && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>Partner</strong> column detected. Add it to your CSV before uploading.</div>}
              {!hasDSP && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>DSP</strong> column detected. Add it to your CSV before uploading.</div>}
              {hasPartner && hasDSP && <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg">✅ Partner and DSP columns detected.</div>}
            </div>

            {/* Period selector */}
            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 mb-3">Select Period</h3>
              <div className="flex gap-4 mb-4">
                <button onClick={() => setPeriodType('monthly')} className={`px-4 py-2 rounded-lg text-sm font-medium ${periodType === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Monthly</button>
                <button onClick={() => setPeriodType('daily')} className={`px-4 py-2 rounded-lg text-sm font-medium ${periodType === 'daily' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Daily</button>
              </div>
              {periodType === 'monthly' ? (
                <div className="flex gap-3">
                  <select value={month} onChange={(e) => setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Month</option>
                    {months.map((m, i) => <option key={m} value={m}>{monthNames[i]}</option>)}
                  </select>
                  <select value={year} onChange={(e) => setYear(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {['2024','2025','2026','2027'].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              ) : (
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              )}
            </div>

            {/* Preview */}
            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 mb-3">Preview ({parsed.length} rows)</h3>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Sub Affiliate', 'Sub Affiliate Name', 'Total Deposit', 'Company Net Win (GGR)', 'Partner', 'DSP'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{row['Sub Affiliate']}</td>
                        <td className="px-3 py-2 text-gray-700">{row['Sub Affiliate Name']}</td>
                        <td className="px-3 py-2 text-gray-700">{row['Total Deposit']}</td>
                        <td className="px-3 py-2 text-gray-700">{row['Company Net Win (GGR)']}</td>
                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${(partnerKey && row[partnerKey]) ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-500'}`}>{(partnerKey && row[partnerKey]) || '—'}</span></td>
                        <td className="px-3 py-2 text-gray-700">{(dspKey && row[dspKey]) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 10 && <p className="text-xs text-gray-400 mt-2">Showing 10 of {parsed.length} rows</p>}
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm">❌ {error}</div>}

            <div className="flex gap-2 justify-end">
              <button onClick={handleCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
              >
                {uploading ? 'Uploading...' : `Upload ${parsed.length} Records`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify manually**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, reload `http://localhost:3000/sss-data`:
1. Select a CSV file. Confirm a modal opens (dark overlay, white panel) containing column warnings, the Select Period section, and the Preview table — and that none of this renders inline on the page behind the modal.
2. If the test CSV has a mixed-case `Dsp` (or `Partner`) header, confirm the Preview table now shows the real value instead of "—".
3. Click **Cancel**. Confirm the modal closes, the page shows "No file selected..." again, and no upload happened.
4. Select a file again, leave the Month dropdown on its blank placeholder, click **Upload**. Confirm the error "Please select a month before uploading." appears *inside* the still-open modal.
5. Pick a valid period and click **Upload** again. Confirm the modal closes automatically and the green success message appears on the page underneath.

- [ ] **Step 5: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Move SSS Data import flow into a modal, fix Preview table Partner/DSP casing"
```
