# Store Directory Bulk Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Bulk Import" button to the Store Directory page that imports many stores at once from a CSV file, upserting by `sub_affiliate`.

**Architecture:** A new API route, `app/api/stores/bulk/route.ts`, upserts an array of store records into the `stores` table on conflict `sub_affiliate` — the same upsert pattern already used when performance-CSV uploads auto-create stores. The Store Directory page gets a new button that parses a CSV with PapaParse (already a project dependency) and shows a modal (column warnings, preview, Cancel/Import) matching the pattern already built for the SSS Data page's import flow.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, Tailwind CSS, PapaParse (no test framework in this repo).

## Global Constraints

- No test suite exists in this repo — verify every change manually (curl for the API, browser/tsc for the UI).
- `sub_affiliate` and `store_name` are required CSV columns (the `stores` table has `NOT NULL` constraints on both) — missing either blocks import entirely, no partial import.
- `partner`, `dsp`, `deployment_status` are optional; an invalid or blank `deployment_status` falls back to `"Not Deployed"`.
- Importing upserts by `sub_affiliate` (update if it exists, insert if new) — no duplicates.
- No change to the existing single-store Add/Edit modal or its `POST`/`PUT /api/stores` calls.
- Column matching is case-insensitive (e.g. `Sub Affiliate`, `sub affiliate`, `SUB AFFILIATE` all match) — this avoids the exact-case-matching bug class already fixed twice on the SSS Data page.

---

### Task 1: Add the bulk upsert API route

**Files:**
- Create: `app/api/stores/bulk/route.ts`

**Interfaces:**
- Produces: `POST /api/stores/bulk` accepting `{ stores: Array<{ sub_affiliate: string, store_name: string, partner: string | null, dsp: string | null, deployment_status: string }> }`, returns `{ success: true, count: number }` on success or `{ error: string }` with status 500 on failure, or `{ error: string }` with status 400 if `stores` is missing/empty/not an array. Task 2 consumes this endpoint.

- [ ] **Step 1: Create the bulk route**

Create `app/api/stores/bulk/route.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

- [ ] **Step 2: Verify manually with curl**

With `npm run dev` running:

```bash
curl -s -X POST "http://localhost:3000/api/stores/bulk" \
  -H "Content-Type: application/json" \
  -d '{"stores":[{"sub_affiliate":"bulktest1","store_name":"Bulk Test Store 1","partner":"Test Partner","dsp":"dsp99","deployment_status":"For Deployment"}]}'
```

Expected: `{"success":true,"count":1}`.

```bash
curl -s "http://localhost:3000/api/stores" | grep -o '"sub_affiliate":"bulktest1"[^}]*'
```

Expected: the row appears with the fields just posted.

Re-run the same POST with a different `store_name` for `bulktest1`:

```bash
curl -s -X POST "http://localhost:3000/api/stores/bulk" \
  -H "Content-Type: application/json" \
  -d '{"stores":[{"sub_affiliate":"bulktest1","store_name":"Bulk Test Store 1 Renamed","partner":"Test Partner","dsp":"dsp99","deployment_status":"For Deployment"}]}'
curl -s "http://localhost:3000/api/stores" | grep -o '"sub_affiliate":"bulktest1"[^}]*'
```

Expected: the store's name updated to "Bulk Test Store 1 Renamed" — confirms upsert-by-`sub_affiliate`, not a duplicate row. Clean up the test row afterward via the Store Directory UI or a direct delete if you have one available.

- [ ] **Step 3: Commit**

```bash
git add app/api/stores/bulk/route.ts
git commit -m "Add bulk upsert API route for stores"
```

---

### Task 2: Add Bulk Import button and modal to Store Directory

**Files:**
- Modify: `app/store-directory/page.tsx`

**Interfaces:**
- Consumes: `POST /api/stores/bulk` (from Task 1).
- Produces: none new — final consumer in this plan.

- [ ] **Step 1: Add `useRef` and PapaParse imports**

Find this block in `app/store-directory/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

type Store = {
```

Replace it with:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'

type Store = {
```

- [ ] **Step 2: Add bulk-import state**

Find this block in `app/store-directory/page.tsx`:

```tsx
export default function StoreDirectoryPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Store | null>(null)
  const [form, setForm] = useState({ sub_affiliate: '', store_name: '', partner: '', dsp: '', deployment_status: 'Not Deployed' })
  const [saving, setSaving] = useState(false)

  const fetchStores = async () => {
```

Replace it with:

```tsx
export default function StoreDirectoryPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Store | null>(null)
  const [form, setForm] = useState({ sub_affiliate: '', store_name: '', partner: '', dsp: '', deployment_status: 'Not Deployed' })
  const [saving, setSaving] = useState(false)

  const [bulkParsed, setBulkParsed] = useState<any[]>([])
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([])
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  const fetchStores = async () => {
```

- [ ] **Step 3: Add the bulk-import handlers**

Find this block in `app/store-directory/page.tsx`:

```tsx
  useEffect(() => { fetchStores() }, [])

  const openAdd = () => {
```

Replace it with:

```tsx
  useEffect(() => { fetchStores() }, [])

  const subAffiliateKey = bulkHeaders.find(h => h.toLowerCase() === 'sub affiliate')
  const storeNameKey = bulkHeaders.find(h => h.toLowerCase() === 'store name')
  const partnerKey = bulkHeaders.find(h => h.toLowerCase() === 'partner')
  const dspKey = bulkHeaders.find(h => h.toLowerCase() === 'dsp')
  const statusKey = bulkHeaders.find(h => h.toLowerCase() === 'deployment status')

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

  const handleBulkImport = async () => {
    if (!subAffiliateKey || !storeNameKey) return
    setBulkUploading(true)
    setBulkError(null)
    const records = bulkParsed.map((row: any) => ({
      sub_affiliate: row[subAffiliateKey],
      store_name: row[storeNameKey],
      partner: (partnerKey ? row[partnerKey] : null) || null,
      dsp: (dspKey ? row[dspKey] : null) || null,
      deployment_status: STATUS_OPTIONS.includes((statusKey ? row[statusKey] : '')) ? row[statusKey] : 'Not Deployed',
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

  const openAdd = () => {
```

- [ ] **Step 4: Add the "Bulk Import" button**

Find this block in `app/store-directory/page.tsx`:

```tsx
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Store Directory</h1>
          <p className="text-sm text-gray-500">{stores.length} total stores</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Store</button>
      </div>
```

Replace it with:

```tsx
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Store Directory</h1>
          <p className="text-sm text-gray-500">{stores.length} total stores</p>
        </div>
        <div className="flex items-center gap-3">
          <input ref={bulkFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBulkFile(f) }} />
          <button onClick={() => bulkFileRef.current?.click()} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors">📤 Bulk Import</button>
          <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Store</button>
        </div>
      </div>
```

- [ ] **Step 5: Add the Bulk Import modal**

Find this block in `app/store-directory/page.tsx` (the end of the existing Add/Edit modal and the component's closing tags):

```tsx
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

Replace it with:

```tsx
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {bulkParsed.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="font-bold text-gray-800 mb-4">Bulk Import Stores</h2>

            {(!subAffiliateKey || !storeNameKey) && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg mb-4">
                ⚠️ CSV must have <strong>Sub Affiliate</strong> and <strong>Store Name</strong> columns.
              </div>
            )}

            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 mb-3">Preview ({bulkParsed.length} rows)</h3>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Sub Affiliate', 'Store Name', 'Partner', 'DSP', 'Deployment Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkParsed.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{subAffiliateKey ? row[subAffiliateKey] : '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{storeNameKey ? row[storeNameKey] : '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{(partnerKey && row[partnerKey]) || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{(dspKey && row[dspKey]) || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{STATUS_OPTIONS.includes((statusKey ? row[statusKey] : '')) ? row[statusKey] : 'Not Deployed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bulkParsed.length > 10 && <p className="text-xs text-gray-400 mt-2">Showing 10 of {bulkParsed.length} rows</p>}
              </div>
            </div>

            {bulkError && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm">❌ {bulkError}</div>}

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
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verify manually**

Run `npx tsc --noEmit` — expect zero errors.

With `npm run dev` running, reload `http://localhost:3000/store-directory`:
1. Click **Bulk Import** and pick a CSV with `Sub Affiliate`, `Store Name`, `Partner`, `DSP`, `Deployment Status` columns. Confirm the modal opens showing a preview and an "Import N Stores" button.
2. Pick a CSV missing the `Store Name` column. Confirm the warning banner appears and no "Import N Stores" button is shown.
3. Click **Import N Stores** on a valid CSV. Confirm the modal closes and the new stores appear in the table.
4. Re-import the same CSV with one row's `Store Name` changed. Confirm that store's row updates in place rather than appearing twice.
5. Click **Cancel** on an open bulk-import modal. Confirm it closes without importing anything.

- [ ] **Step 7: Commit**

```bash
git add app/store-directory/page.tsx
git commit -m "Add Bulk Import button and modal to Store Directory"
```
