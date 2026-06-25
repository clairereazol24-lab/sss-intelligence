# In-App Update Confirm Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native `window.confirm()` dialog used by "Update File" mode in SSS Data and Store Directory with an in-app, styled two-step footer inside the same import modal.

**Architecture:** Each page's upload handler splits into a click-gate function (existing validation, plus: if in Update mode and not yet confirming, flip a `confirming` flag and stop) and the actual upload function (the existing fetch/response logic, unchanged, minus the old `window.confirm` call). The modal footer conditionally renders based on the `confirming` flag: normal Cancel/Upload buttons when `false`, or "step back" Cancel + red "Yes, Replace ..." when `true`.

**Tech Stack:** Next.js 14 App Router, TypeScript, React state, Tailwind CSS (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually (`npx tsc --noEmit`, `npm run build`, and browser click-through for the confirm-step interaction only — do not exercise the actual destructive submit against live data as part of this plan's verification, since that was already proven safe in the prior plan).
- No backend/API changes. The `mode`/`removed` contract on `/api/upload` and `/api/stores/bulk` is untouched.
- The static amber warning already shown under the "Upload Mode" toggle when `mode`/`bulkMode === 'update'` stays exactly as-is — do not add a second/duplicate warning banner for the confirm step.
- Cancelling the confirm step (clicking "Cancel" while confirming) must only step back to the normal footer — it must NOT close the whole modal. This matches today's behavior where dismissing `window.confirm` aborted only the upload attempt, leaving the modal and loaded file in place.
- `confirming`/`bulkConfirming` must reset to `false` whenever: the mode toggle is clicked (either button), the modal is cancelled/closed, or an upload attempt completes (success or error) — so a retry after an error always re-shows the explicit confirm step.

---

### Task 1: SSS Data import modal confirm step

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Consumes: nothing new — uses the existing `mode`/`removed` contract on `POST /api/upload` from the prior plan.
- Produces: none new — final consumer in this plan for SSS Data.

- [ ] **Step 1: Add `confirming` state**

Find this block in `app/sss-data/page.tsx`:

```tsx
  const [hasPartner, setHasPartner] = useState(false)
  const [hasDSP, setHasDSP] = useState(false)
  const [mode, setMode] = useState<'new' | 'update'>('new')
  const fileRef = useRef<HTMLInputElement>(null)
```

Replace it with:

```tsx
  const [hasPartner, setHasPartner] = useState(false)
  const [hasDSP, setHasDSP] = useState(false)
  const [mode, setMode] = useState<'new' | 'update'>('new')
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Reset `confirming` on cancel**

Find this block:

```tsx
  const handleCancel = () => {
    setFile(null)
    setParsed([])
    setHeaders([])
    setHasPartner(false)
    setHasDSP(false)
    setMode('new')
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }
```

Replace it with:

```tsx
  const handleCancel = () => {
    setFile(null)
    setParsed([])
    setHeaders([])
    setHasPartner(false)
    setHasDSP(false)
    setMode('new')
    setConfirming(false)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }
```

- [ ] **Step 3: Split `handleUpload` into a click-gate and the actual upload, removing `window.confirm`**

Find this block (the entire current `handleUpload` function):

```tsx
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
    if (mode === 'update' && !window.confirm(
      'This will replace data for the selected period — any store missing from this file will be removed from that period. Continue?'
    )) {
      return
    }
    setUploading(true)
    setError(null)

    const records = parsed.map((row: any) => ({
      sub_affiliate: row['Sub Affiliate'],
      store_name: row['Sub Affiliate Name'],
      total_deposit: row['Total Deposit'],
      total_withdraw: row['Total Withdraw'],
      valid_bet_amount: row['Valid Bet Amount'],
      company_net_win: row['Company Net Win (GGR)'],
      payout_amount: row['Payout Amount'],
      total_promotion_amount: row['Total Promotion Amount'],
      registered_members: row['Registered Members'],
      first_deposit_amount: row['First Deposit Amount'],
      first_deposit_count: row['First Deposit Count'],
      deposit_member_count: row['Deposit Member Count'],
      members_withdrawn: row['Number of Members Withdrawn'],
      effective_member: row['Effective Member'],
      partner: (partnerKey ? row[partnerKey] : null) || null,
      dsp: (dspKey ? row[dspKey] : null) || null,
    }))

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, period, periodType, mode }),
    })
    const data = await res.json()
    setUploading(false)
    if (data.error) {
      setError(data.error)
    } else {
      setResult(
        mode === 'update'
          ? `✅ Updated period ${period}: ${data.count} records upserted, ${data.removed} removed.`
          : `✅ Successfully uploaded ${data.count} store records for period: ${period}`
      )
      setParsed([])
      setFile(null)
      setMode('new')
      if (fileRef.current) fileRef.current.value = ''
    }
  }
```

Replace it with:

```tsx
  const handleUploadClick = () => {
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
    if (mode === 'update' && !confirming) {
      setConfirming(true)
      return
    }
    performUpload()
  }

  const performUpload = async () => {
    setConfirming(false)
    const period = getPeriod()
    setUploading(true)
    setError(null)

    const records = parsed.map((row: any) => ({
      sub_affiliate: row['Sub Affiliate'],
      store_name: row['Sub Affiliate Name'],
      total_deposit: row['Total Deposit'],
      total_withdraw: row['Total Withdraw'],
      valid_bet_amount: row['Valid Bet Amount'],
      company_net_win: row['Company Net Win (GGR)'],
      payout_amount: row['Payout Amount'],
      total_promotion_amount: row['Total Promotion Amount'],
      registered_members: row['Registered Members'],
      first_deposit_amount: row['First Deposit Amount'],
      first_deposit_count: row['First Deposit Count'],
      deposit_member_count: row['Deposit Member Count'],
      members_withdrawn: row['Number of Members Withdrawn'],
      effective_member: row['Effective Member'],
      partner: (partnerKey ? row[partnerKey] : null) || null,
      dsp: (dspKey ? row[dspKey] : null) || null,
    }))

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, period, periodType, mode }),
    })
    const data = await res.json()
    setUploading(false)
    if (data.error) {
      setError(data.error)
    } else {
      setResult(
        mode === 'update'
          ? `✅ Updated period ${period}: ${data.count} records upserted, ${data.removed} removed.`
          : `✅ Successfully uploaded ${data.count} store records for period: ${period}`
      )
      setParsed([])
      setFile(null)
      setMode('new')
      if (fileRef.current) fileRef.current.value = ''
    }
  }
```

- [ ] **Step 4: Reset `confirming` when the mode toggle buttons are clicked**

Find this block:

```tsx
                <button onClick={() => setMode('new')} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>New Upload</button>
                <button onClick={() => setMode('update')} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Update File</button>
```

Replace it with:

```tsx
                <button onClick={() => { setMode('new'); setConfirming(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>New Upload</button>
                <button onClick={() => { setMode('update'); setConfirming(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Update File</button>
```

- [ ] **Step 5: Make the footer swap between normal and confirming states**

Find this block:

```tsx
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
```

Replace it with:

```tsx
            <div className="flex gap-2 justify-end">
              <button onClick={confirming ? () => setConfirming(false) : handleCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={handleUploadClick}
                disabled={uploading}
                className={confirming ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm'}
              >
                {uploading ? 'Uploading...' : confirming ? 'Yes, Replace Data' : `Upload ${parsed.length} Records`}
              </button>
            </div>
```

- [ ] **Step 6: Verify manually**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, reload `http://localhost:3000/sss-data`:
1. Click **Import**, pick a CSV, select a period. Leave **New Upload** selected and click "Upload N Records" — confirm it uploads immediately with no confirm step (unchanged behavior).
2. Open the import modal again, click **Update File**. Confirm the existing amber warning appears (unchanged).
3. Click "Upload N Records" — confirm the footer swaps in place: the primary button turns red and reads "Yes, Replace Data"; no second/duplicate banner appears; "Cancel" is still in the same position.
4. Click "Cancel" while in this confirming state — confirm the footer reverts to the normal blue "Upload N Records" button, and the modal stays open with the file and period selection still intact (not closed).
5. Click "Update File" → "Upload N Records" again to re-enter the confirming state, then click **New Upload** — confirm it immediately drops back to the normal (non-confirming) footer for New Upload mode.
6. Run `npm run build` — expect a clean build covering `/sss-data`.

- [ ] **Step 7: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Replace window.confirm with in-app confirm step in SSS Data import modal"
```

---

### Task 2: Store Directory bulk import modal confirm step

**Files:**
- Modify: `app/store-directory/page.tsx`

**Interfaces:**
- Consumes: nothing new — uses the existing `mode`/`removed` contract on `POST /api/stores/bulk` from the prior plan.
- Produces: none new — final consumer in this plan.

- [ ] **Step 1: Add `bulkConfirming` state**

Find this block in `app/store-directory/page.tsx`:

```tsx
  const [bulkParsed, setBulkParsed] = useState<any[]>([])
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([])
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState<'new' | 'update'>('new')
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)
```

Replace it with:

```tsx
  const [bulkParsed, setBulkParsed] = useState<any[]>([])
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([])
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState<'new' | 'update'>('new')
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Reset `bulkConfirming` on cancel**

Find this block:

```tsx
  const handleBulkCancel = () => {
    setBulkParsed([])
    setBulkHeaders([])
    setBulkError(null)
    setBulkMode('new')
    if (bulkFileRef.current) bulkFileRef.current.value = ''
  }
```

Replace it with:

```tsx
  const handleBulkCancel = () => {
    setBulkParsed([])
    setBulkHeaders([])
    setBulkError(null)
    setBulkMode('new')
    setBulkConfirming(false)
    if (bulkFileRef.current) bulkFileRef.current.value = ''
  }
```

- [ ] **Step 3: Split `handleBulkImport` into a click-gate and the actual import, removing `window.confirm`**

Find this block (the entire current `handleBulkImport` function):

```tsx
  const handleBulkImport = async () => {
    if (!subAffiliateKey || !storeNameKey) return
    if (bulkMode === 'update' && !window.confirm(
      'This will replace the entire Store Directory — any store missing from this file will be deleted. Continue?'
    )) {
      return
    }
    setBulkUploading(true)
    setBulkError(null)
    const records = bulkParsed.map((row: any) => ({
      sub_affiliate: row[subAffiliateKey],
      store_name: row[storeNameKey],
      partner: (partnerKey ? row[partnerKey] : null) || null,
      dsp: (dspKey ? row[dspKey] : null) || null,
      deployment_status: statusKey && STATUS_OPTIONS.includes(row[statusKey]) ? row[statusKey] : 'Not Deployed',
    }))
    const res = await fetch('/api/stores/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stores: records, mode: bulkMode }),
    })
    const data = await res.json()
    setBulkUploading(false)
    if (data.error) {
      setBulkError(data.error)
    } else {
      const wasUpdateMode = bulkMode === 'update'
      handleBulkCancel()
      if (wasUpdateMode) {
        setBulkResult(`✅ Directory updated: ${data.count} stores upserted, ${data.removed} removed.`)
      }
      fetchStores()
    }
  }
```

Replace it with:

```tsx
  const handleBulkImportClick = () => {
    if (!subAffiliateKey || !storeNameKey) return
    if (bulkMode === 'update' && !bulkConfirming) {
      setBulkConfirming(true)
      return
    }
    performBulkImport()
  }

  const performBulkImport = async () => {
    setBulkConfirming(false)
    setBulkUploading(true)
    setBulkError(null)
    const records = bulkParsed.map((row: any) => ({
      sub_affiliate: row[subAffiliateKey],
      store_name: row[storeNameKey],
      partner: (partnerKey ? row[partnerKey] : null) || null,
      dsp: (dspKey ? row[dspKey] : null) || null,
      deployment_status: statusKey && STATUS_OPTIONS.includes(row[statusKey]) ? row[statusKey] : 'Not Deployed',
    }))
    const res = await fetch('/api/stores/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stores: records, mode: bulkMode }),
    })
    const data = await res.json()
    setBulkUploading(false)
    if (data.error) {
      setBulkError(data.error)
    } else {
      const wasUpdateMode = bulkMode === 'update'
      handleBulkCancel()
      if (wasUpdateMode) {
        setBulkResult(`✅ Directory updated: ${data.count} stores upserted, ${data.removed} removed.`)
      }
      fetchStores()
    }
  }
```

- [ ] **Step 4: Reset `bulkConfirming` when the mode toggle buttons are clicked**

Find this block:

```tsx
                <button onClick={() => setBulkMode('new')} className={`px-4 py-2 rounded-lg text-sm font-medium ${bulkMode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>New Upload</button>
                <button onClick={() => setBulkMode('update')} className={`px-4 py-2 rounded-lg text-sm font-medium ${bulkMode === 'update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Update File</button>
```

Replace it with:

```tsx
                <button onClick={() => { setBulkMode('new'); setBulkConfirming(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${bulkMode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>New Upload</button>
                <button onClick={() => { setBulkMode('update'); setBulkConfirming(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${bulkMode === 'update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Update File</button>
```

- [ ] **Step 5: Make the footer swap between normal and confirming states**

Find this block:

```tsx
            <div className="flex gap-2 justify-end">
              <button onClick={handleBulkCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              {subAffiliateKey && storeNameKey && (
                <button
                  onClick={handleBulkImport}
                  disabled={bulkUploading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                >
                  {bulkUploading ? 'Importing...' : `Import ${bulkParsed.length} Stores`}
                </button>
              )}
            </div>
```

Replace it with:

```tsx
            <div className="flex gap-2 justify-end">
              <button onClick={bulkConfirming ? () => setBulkConfirming(false) : handleBulkCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              {subAffiliateKey && storeNameKey && (
                <button
                  onClick={handleBulkImportClick}
                  disabled={bulkUploading}
                  className={bulkConfirming ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm'}
                >
                  {bulkUploading ? 'Importing...' : bulkConfirming ? 'Yes, Replace Directory' : `Import ${bulkParsed.length} Stores`}
                </button>
              )}
            </div>
```

- [ ] **Step 6: Verify manually**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, reload `http://localhost:3000/store-directory`:
1. Click **Bulk Import**, pick a CSV. Leave **New Upload** selected and click "Import N Stores" — confirm it imports immediately with no confirm step (unchanged behavior, no result banner).
2. Open the bulk import modal again, click **Update File**. Confirm the existing amber warning appears (unchanged).
3. Click "Import N Stores" — confirm the footer swaps in place: the primary button turns red and reads "Yes, Replace Directory"; no second/duplicate banner appears; "Cancel" stays in the same position.
4. Click "Cancel" while in this confirming state — confirm the footer reverts to the normal blue "Import N Stores" button, and the modal stays open with the file still loaded (not closed).
5. Click "Update File" → "Import N Stores" again to re-enter the confirming state, then click **New Upload** — confirm it immediately drops back to the normal (non-confirming) footer.
6. Run `npm run build` — expect a clean build covering `/store-directory`.

**Do not click the red "Yes, Replace Directory" button against the live database as part of this verification** — the delete-by-exclusion behavior itself was already proven safe in the prior plan (Task 2); this task only changes how the confirm step looks, not what it does.

- [ ] **Step 7: Commit**

```bash
git add app/store-directory/page.tsx
git commit -m "Replace window.confirm with in-app confirm step in Store Directory bulk import modal"
```
