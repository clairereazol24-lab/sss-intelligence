# Upload Mode: New Upload vs Update File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "New Upload" / "Update File" toggle to the SSS Data and Store Directory import flows, so re-uploading a corrected file can fully replace existing data instead of only upserting.

**Architecture:** Both import API routes (`app/api/upload/route.ts`, `app/api/stores/bulk/route.ts`) gain an optional `mode: 'new' | 'update'` field. `'new'` (the default) keeps today's upsert-only behavior. `'update'` runs the existing upsert first, then deletes rows that are in scope but missing from the uploaded file (scoped to the selected period for SSS Data; the whole table for Store Directory), returning a `removed` count. Both page components (`app/sss-data/page.tsx`, `app/store-directory/page.tsx`) get a matching mode toggle in their import modal, an inline warning when "Update File" is selected, a `window.confirm()` gate before the destructive submit, and an updated success message reporting the `removed` count.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, Tailwind CSS, PapaParse (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually (curl for the APIs, `npx tsc --noEmit` plus browser for the UI).
- Default `mode` is `'new'` when omitted, so any existing caller of either API keeps today's exact behavior.
- Order is always upsert first, delete second — if the upsert throws, the function returns before any delete runs.
- `'update'` mode rejects an empty file/array with a 400 before any DB call (see Task 1 — Store Directory's existing empty-array check already covers this; SSS Data's upload route needs a new check since it currently only validates `records` is present, not non-empty).
- SSS Data's delete scope is `period` + `period_type` (only the selected period is replaced). Store Directory's delete scope is the entire `stores` table (no partner/DSP scoping).
- The confirm dialog and inline warning only appear when `mode === 'update'`; `'new'` mode's UI and messages are unchanged from today.

---

### Task 1: Add `mode` support to the SSS Data upload route

**Files:**
- Modify: `app/api/upload/route.ts`

**Interfaces:**
- Produces: `POST /api/upload` now accepts `{ records, period, periodType, mode?: 'new' | 'update' }`. Response is `{ success: true, count: number, removed: number }` (`removed` is always `0` for `mode: 'new'`), or `{ error: string }` with status 400 (missing fields, or `mode: 'update'` with an empty `records` array) or 500 (DB error). Task 3 consumes this endpoint.

- [ ] **Step 1: Replace the route with mode-aware logic**

Find this block in `app/api/upload/route.ts`:

```ts
export async function POST(request: NextRequest) {
  try {
    const { records, period, periodType } = await request.json()

    if (!records || !period || !periodType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Auto-upsert stores master table
```

Replace it with:

```ts
export async function POST(request: NextRequest) {
  try {
    const { records, period, periodType, mode } = await request.json()

    if (!records || !period || !periodType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const uploadMode = mode === 'update' ? 'update' : 'new'

    if (uploadMode === 'update' && records.length === 0) {
      return NextResponse.json({ error: 'Cannot update with an empty file.' }, { status: 400 })
    }

    // Auto-upsert stores master table
```

Find this block (the end of the function):

```ts
    const { error } = await supabase
      .from('performance_data')
      .upsert(perfRecords, { onConflict: 'sub_affiliate,period' })

    if (error) throw error

    return NextResponse.json({ success: true, count: perfRecords.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

Replace it with:

```ts
    const { error } = await supabase
      .from('performance_data')
      .upsert(perfRecords, { onConflict: 'sub_affiliate,period' })

    if (error) throw error

    let removed = 0
    if (uploadMode === 'update') {
      const idList = perfRecords.map((r) => `"${r.sub_affiliate}"`).join(',')
      const { data: removedRows, error: deleteError } = await supabase
        .from('performance_data')
        .delete()
        .eq('period', period)
        .eq('period_type', periodType)
        .not('sub_affiliate', 'in', `(${idList})`)
        .select()

      if (deleteError) throw deleteError
      removed = removedRows?.length || 0
    }

    return NextResponse.json({ success: true, count: perfRecords.length, removed })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify manually with curl**

With `npm run dev` running, upload two rows for period `2099-01` (a period unlikely to collide with real data):

```bash
curl -s -X POST "http://localhost:3000/api/upload" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"sub_affiliate":"plantest1","store_name":"Plan Test 1","total_deposit":"100","total_withdraw":"0","valid_bet_amount":"0","company_net_win":"0","payout_amount":"0","total_promotion_amount":"0","registered_members":"1","first_deposit_amount":"0","first_deposit_count":"0","deposit_member_count":"0","members_withdrawn":"0","effective_member":"0"},{"sub_affiliate":"plantest2","store_name":"Plan Test 2","total_deposit":"200","total_withdraw":"0","valid_bet_amount":"0","company_net_win":"0","payout_amount":"0","total_promotion_amount":"0","registered_members":"1","first_deposit_amount":"0","first_deposit_count":"0","deposit_member_count":"0","members_withdrawn":"0","effective_member":"0"}],"period":"2099-01","periodType":"monthly","mode":"new"}'
```

Expected: `{"success":true,"count":2,"removed":0}`.

```bash
curl -s "http://localhost:3000/api/performance?period=2099-01"
```

Expected: `allStores` contains both `plantest1` and `plantest2`.

Now re-upload with `mode: "update"` and only `plantest1`:

```bash
curl -s -X POST "http://localhost:3000/api/upload" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"sub_affiliate":"plantest1","store_name":"Plan Test 1","total_deposit":"150","total_withdraw":"0","valid_bet_amount":"0","company_net_win":"0","payout_amount":"0","total_promotion_amount":"0","registered_members":"1","first_deposit_amount":"0","first_deposit_count":"0","deposit_member_count":"0","members_withdrawn":"0","effective_member":"0"}],"period":"2099-01","periodType":"monthly","mode":"update"}'
```

Expected: `{"success":true,"count":1,"removed":1}` (`plantest2` was removed).

```bash
curl -s "http://localhost:3000/api/performance?period=2099-01"
```

Expected: `allStores` contains only `plantest1` with `total_deposit` updated to `150`; `plantest2` is gone.

Test the empty-file guard:

```bash
curl -s -X POST "http://localhost:3000/api/upload" \
  -H "Content-Type: application/json" \
  -d '{"records":[],"period":"2099-01","periodType":"monthly","mode":"update"}'
```

Expected: `{"error":"Cannot update with an empty file."}`. Confirm `plantest1` is still present afterward via the `/api/performance?period=2099-01` call above.

Clean up the test period afterward (e.g. via Supabase SQL editor: `delete from performance_data where period = '2099-01';` and `delete from stores where sub_affiliate in ('plantest1','plantest2');`).

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/route.ts
git commit -m "Add update mode to SSS Data upload route for full period replace"
```

---

### Task 2: Add `mode` support to the Store Directory bulk route

**Files:**
- Modify: `app/api/stores/bulk/route.ts`

**Interfaces:**
- Produces: `POST /api/stores/bulk` now accepts `{ stores, mode?: 'new' | 'update' }`. Response is `{ success: true, count: number, removed: number }` (`removed` is always `0` for `mode: 'new'`), or `{ error: string }` with status 400 (no stores provided — this already covers the empty-array-in-update-mode guard) or 500 (DB error). Task 4 consumes this endpoint.

- [ ] **Step 1: Replace the route with mode-aware logic**

Find this block in `app/api/stores/bulk/route.ts`:

```ts
export async function POST(request: NextRequest) {
  try {
    const { stores } = await request.json()

    if (!stores || !Array.isArray(stores) || stores.length === 0) {
      return NextResponse.json({ error: 'No stores provided' }, { status: 400 })
    }

    const records = stores.map((s: any) => ({
      sub_affiliate: s.sub_affiliate,
      store_name: s.store_name,
      partner: s.partner || null,
      dsp: s.dsp || null,
      deployment_status: s.deployment_status || 'Not Deployed',
      updated_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from('stores')
      .upsert(records, { onConflict: 'sub_affiliate' })
      .select()

    if (error) throw error

    return NextResponse.json({ success: true, count: data?.length || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

Replace it with:

```ts
export async function POST(request: NextRequest) {
  try {
    const { stores, mode } = await request.json()

    if (!stores || !Array.isArray(stores) || stores.length === 0) {
      return NextResponse.json({ error: 'No stores provided' }, { status: 400 })
    }

    const uploadMode = mode === 'update' ? 'update' : 'new'

    const records = stores.map((s: any) => ({
      sub_affiliate: s.sub_affiliate,
      store_name: s.store_name,
      partner: s.partner || null,
      dsp: s.dsp || null,
      deployment_status: s.deployment_status || 'Not Deployed',
      updated_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from('stores')
      .upsert(records, { onConflict: 'sub_affiliate' })
      .select()

    if (error) throw error

    let removed = 0
    if (uploadMode === 'update') {
      const idList = records.map((r) => `"${r.sub_affiliate}"`).join(',')
      const { data: removedRows, error: deleteError } = await supabase
        .from('stores')
        .delete()
        .not('sub_affiliate', 'in', `(${idList})`)
        .select()

      if (deleteError) throw deleteError
      removed = removedRows?.length || 0
    }

    return NextResponse.json({ success: true, count: data?.length || 0, removed })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify manually with curl**

With `npm run dev` running, create two test stores with `mode: "new"`:

```bash
curl -s -X POST "http://localhost:3000/api/stores/bulk" \
  -H "Content-Type: application/json" \
  -d '{"stores":[{"sub_affiliate":"plandirtest1","store_name":"Plan Dir Test 1"},{"sub_affiliate":"plandirtest2","store_name":"Plan Dir Test 2"}],"mode":"new"}'
```

Expected: `{"success":true,"count":2,"removed":0}`.

```bash
curl -s "http://localhost:3000/api/stores" | grep -o '"sub_affiliate":"plandirtest[12]"'
```

Expected: both rows present.

Now re-import with `mode: "update"` and only `plandirtest1`:

```bash
curl -s -X POST "http://localhost:3000/api/stores/bulk" \
  -H "Content-Type: application/json" \
  -d '{"stores":[{"sub_affiliate":"plandirtest1","store_name":"Plan Dir Test 1 Renamed"}],"mode":"update"}'
```

Expected: `{"success":true,"count":1,"removed":1}` (this will also remove every *other* pre-existing store not in this one-row file — **only run this against a disposable/local Supabase project, not the live database**, or first capture the full current `stores` table so it can be restored).

```bash
curl -s "http://localhost:3000/api/stores" | grep -o '"sub_affiliate":"plandirtest[12]"'
```

Expected: only `plandirtest1` is present.

Clean up the test rows afterward (e.g. via Supabase SQL editor: `delete from stores where sub_affiliate = 'plandirtest1';`), and restore any other rows removed by the update-mode test if this was run against shared data.

- [ ] **Step 3: Commit**

```bash
git add app/api/stores/bulk/route.ts
git commit -m "Add update mode to Store Directory bulk route for full directory replace"
```

---

### Task 3: Add the mode toggle to the SSS Data import modal

**Files:**
- Modify: `app/sss-data/page.tsx`

**Interfaces:**
- Consumes: `POST /api/upload` from Task 1 (body now includes `mode`, response includes `removed`).
- Produces: none new — final consumer in this plan for SSS Data.

- [ ] **Step 1: Add mode state**

Find this block in `app/sss-data/page.tsx`:

```tsx
  const [hasPartner, setHasPartner] = useState(false)
  const [hasDSP, setHasDSP] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
```

Replace it with:

```tsx
  const [hasPartner, setHasPartner] = useState(false)
  const [hasDSP, setHasDSP] = useState(false)
  const [mode, setMode] = useState<'new' | 'update'>('new')
  const fileRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Reset mode on cancel**

Find this block in `app/sss-data/page.tsx`:

```tsx
  const handleCancel = () => {
    setFile(null)
    setParsed([])
    setHeaders([])
    setHasPartner(false)
    setHasDSP(false)
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
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }
```

- [ ] **Step 3: Add the confirm gate and send `mode` in `handleUpload`**

Find this block in `app/sss-data/page.tsx`:

```tsx
    const period = getPeriod()
    if (!period || period.includes('undefined') || period === '-') {
      setError('Please select a valid period.')
      return
    }
    setUploading(true)
    setError(null)
```

Replace it with:

```tsx
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
```

Find this block:

```tsx
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, period, periodType }),
    })
    const data = await res.json()
    setUploading(false)
    if (data.error) {
      setError(data.error)
    } else {
      setResult(`✅ Successfully uploaded ${data.count} store records for period: ${period}`)
      setParsed([])
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
```

Replace it with:

```tsx
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

- [ ] **Step 4: Add the Upload Mode toggle to the modal**

Find this block in `app/sss-data/page.tsx`:

```tsx
            {/* Column warnings */}
            <div className="mb-4 space-y-2">
              {!hasPartner && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>Partner</strong> column detected. Add it to your CSV before uploading.</div>}
              {!hasDSP && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>DSP</strong> column detected. Add it to your CSV before uploading.</div>}
              {hasPartner && hasDSP && <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg">✅ Partner and DSP columns detected.</div>}
            </div>

            {/* Period selector */}
```

Replace it with:

```tsx
            {/* Column warnings */}
            <div className="mb-4 space-y-2">
              {!hasPartner && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>Partner</strong> column detected. Add it to your CSV before uploading.</div>}
              {!hasDSP && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>DSP</strong> column detected. Add it to your CSV before uploading.</div>}
              {hasPartner && hasDSP && <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg">✅ Partner and DSP columns detected.</div>}
            </div>

            {/* Upload mode */}
            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 mb-3">Upload Mode</h3>
              <div className="flex gap-4 mb-2">
                <button onClick={() => setMode('new')} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>New Upload</button>
                <button onClick={() => setMode('update')} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Update File</button>
              </div>
              {mode === 'update' && (
                <p className="text-xs text-amber-600">⚠️ This will replace data for the selected period — any store missing from this file will be removed from that period.</p>
              )}
            </div>

            {/* Period selector */}
```

- [ ] **Step 5: Verify manually**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, reload `http://localhost:3000/sss-data`:
1. Click **Import**, pick a CSV. Confirm the modal shows an "Upload Mode" section defaulting to **New Upload** selected, with no warning text.
2. Click **Update File**. Confirm the amber warning appears.
3. Select a period already containing data, then click **Upload N Records**. Confirm a `window.confirm` dialog appears with the replace warning; click **Cancel** on it and confirm the modal stays open and nothing is sent (check the Network tab — no request fired).
4. Click **Upload N Records** again, accept the confirm dialog. Confirm the success message reads "Updated period ...: N records upserted, M removed." and the Store Summary table no longer shows stores that were missing from the new file for that period.
5. Re-open the import modal, leave **New Upload** selected, upload a file for a different period. Confirm the success message matches today's original wording and no confirm dialog appears.

- [ ] **Step 6: Commit**

```bash
git add app/sss-data/page.tsx
git commit -m "Add New Upload/Update File toggle to SSS Data import modal"
```

---

### Task 4: Add the mode toggle to the Store Directory bulk import modal

**Files:**
- Modify: `app/store-directory/page.tsx`

**Interfaces:**
- Consumes: `POST /api/stores/bulk` from Task 2 (body now includes `mode`, response includes `removed`).
- Produces: none new — final consumer in this plan.

- [ ] **Step 1: Add mode and result state**

Find this block in `app/store-directory/page.tsx`:

```tsx
  const [bulkParsed, setBulkParsed] = useState<any[]>([])
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([])
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)
```

Replace it with:

```tsx
  const [bulkParsed, setBulkParsed] = useState<any[]>([])
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([])
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState<'new' | 'update'>('new')
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Clear the result banner when a new file is picked, and reset mode on cancel**

Find this block in `app/store-directory/page.tsx`:

```tsx
  const handleBulkFile = (f: File) => {
    setBulkError(null)
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setBulkHeaders(res.meta.fields || [])
        setBulkParsed(res.data as any[])
      },
    })
  }

  const handleBulkCancel = () => {
    setBulkParsed([])
    setBulkHeaders([])
    setBulkError(null)
    if (bulkFileRef.current) bulkFileRef.current.value = ''
  }
```

Replace it with:

```tsx
  const handleBulkFile = (f: File) => {
    setBulkError(null)
    setBulkResult(null)
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setBulkHeaders(res.meta.fields || [])
        setBulkParsed(res.data as any[])
      },
    })
  }

  const handleBulkCancel = () => {
    setBulkParsed([])
    setBulkHeaders([])
    setBulkError(null)
    setBulkMode('new')
    if (bulkFileRef.current) bulkFileRef.current.value = ''
  }
```

- [ ] **Step 3: Add the confirm gate, send `mode`, and show the result banner only for Update File**

Find this block in `app/store-directory/page.tsx`:

```tsx
  const handleBulkImport = async () => {
    if (!subAffiliateKey || !storeNameKey) return
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
      body: JSON.stringify({ stores: records }),
    })
    const data = await res.json()
    setBulkUploading(false)
    if (data.error) {
      setBulkError(data.error)
    } else {
      handleBulkCancel()
      fetchStores()
    }
  }
```

Replace it with:

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

- [ ] **Step 4: Show the result banner under the page header**

Find this block in `app/store-directory/page.tsx`:

```tsx
          <button onClick={() => bulkFileRef.current?.click()} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors">📤 Bulk Import</button>
          <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Store</button>
        </div>
      </div>

      {/* Filters */}
```

Replace it with:

```tsx
          <button onClick={() => bulkFileRef.current?.click()} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors">📤 Bulk Import</button>
          <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Store</button>
        </div>
      </div>

      {bulkResult && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm">{bulkResult}</div>}

      {/* Filters */}
```

- [ ] **Step 5: Add the Upload Mode toggle to the Bulk Import modal**

Find this block in `app/store-directory/page.tsx`:

```tsx
            {(!subAffiliateKey || !storeNameKey) && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg mb-4">
                ⚠️ CSV must have <strong>Sub Affiliate</strong> and <strong>Store Name</strong> columns.
              </div>
            )}

            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 mb-3">Preview ({bulkParsed.length} rows)</h3>
```

Replace it with:

```tsx
            {(!subAffiliateKey || !storeNameKey) && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg mb-4">
                ⚠️ CSV must have <strong>Sub Affiliate</strong> and <strong>Store Name</strong> columns.
              </div>
            )}

            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 mb-3">Upload Mode</h3>
              <div className="flex gap-4 mb-2">
                <button onClick={() => setBulkMode('new')} className={`px-4 py-2 rounded-lg text-sm font-medium ${bulkMode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>New Upload</button>
                <button onClick={() => setBulkMode('update')} className={`px-4 py-2 rounded-lg text-sm font-medium ${bulkMode === 'update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Update File</button>
              </div>
              {bulkMode === 'update' && (
                <p className="text-xs text-amber-600">⚠️ This will replace the entire Store Directory — any store missing from this file will be deleted.</p>
              )}
            </div>

            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 mb-3">Preview ({bulkParsed.length} rows)</h3>
```

- [ ] **Step 6: Verify manually**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, reload `http://localhost:3000/store-directory`:
1. Click **Bulk Import**, pick a CSV. Confirm the modal shows an "Upload Mode" section defaulting to **New Upload**, no warning text, and no `window.confirm` fires on **Import N Stores**. Confirm no result banner appears after import (today's silent behavior).
2. Click **Bulk Import** again, pick a CSV, click **Update File**. Confirm the amber warning appears.
3. Click **Import N Stores**. Confirm a `window.confirm` dialog appears with the replace warning; click **Cancel** and confirm the modal stays open and no request fires.
4. Click **Import N Stores** again, accept the confirm dialog. Confirm the green result banner appears reading "Directory updated: N stores upserted, M removed." and the table no longer lists stores that were missing from the file.

- [ ] **Step 7: Commit**

```bash
git add app/store-directory/page.tsx
git commit -m "Add New Upload/Update File toggle to Store Directory bulk import modal"
```
