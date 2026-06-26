'use client'
import { useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'

type Store = {
  id: string
  sub_affiliate: string
  store_name: string
  partner: string | null
  dsp: string | null
  deployment_status: string
}

const STATUS_OPTIONS = ['Fully Deployed', 'For Deployment', 'Not Deployed']
const statusColor = (s: string) =>
  s === 'Fully Deployed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
  s === 'For Deployment' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
  'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'

export default function StoreDirectoryPage({ partner }: { partner?: string }) {
  const [stores, setStores] = useState<Store[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Store | null>(null)
  const [form, setForm] = useState({ sub_affiliate: '', store_name: '', partner: partner || '', dsp: '', deployment_status: 'Not Deployed' })
  const [saving, setSaving] = useState(false)

  const [bulkParsed, setBulkParsed] = useState<any[]>([])
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([])
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState<'new' | 'update'>('new')
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  const fetchStores = async () => {
    setLoading(true)
    const url = partner ? `/api/stores?partner=${encodeURIComponent(partner)}` : '/api/stores'
    const res = await fetch(url)
    const data = await res.json()
    setStores(data)
    setLoading(false)
  }

  useEffect(() => { fetchStores() }, [partner])

  const subAffiliateKey = bulkHeaders.find(h => h.toLowerCase() === 'sub affiliate')
  const storeNameKey = bulkHeaders.find(h => h.toLowerCase() === 'store name')
  const partnerKey = bulkHeaders.find(h => h.toLowerCase() === 'partner')
  const dspKey = bulkHeaders.find(h => h.toLowerCase() === 'dsp')
  const statusKey = bulkHeaders.find(h => h.toLowerCase() === 'deployment status')

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
    setBulkConfirming(false)
    if (bulkFileRef.current) bulkFileRef.current.value = ''
  }

  const handleBulkImportClick = () => {
    if (!subAffiliateKey || !storeNameKey) return
    if (bulkMode === 'update' && !bulkConfirming) { setBulkConfirming(true); return }
    performBulkImport()
  }

  const performBulkImport = async () => {
    if (!subAffiliateKey || !storeNameKey) return
    setBulkConfirming(false)
    setBulkUploading(true)
    setBulkError(null)
    const records = bulkParsed.map((row: any) => ({
      sub_affiliate: row[subAffiliateKey],
      store_name: row[storeNameKey],
      partner: partner || (partnerKey ? row[partnerKey] : null) || null,
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
      setBulkResult(wasUpdateMode
        ? `✅ Directory updated: ${data.count} stores upserted, ${data.removed} removed.`
        : `✅ Successfully imported ${data.count} stores.`)
      fetchStores()
    }
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ sub_affiliate: '', store_name: '', partner: partner || '', dsp: '', deployment_status: 'Not Deployed' })
    setModal(true)
  }

  const openEdit = (s: Store) => {
    setEditing(s)
    setForm({ sub_affiliate: s.sub_affiliate, store_name: s.store_name, partner: s.partner || '', dsp: s.dsp || '', deployment_status: s.deployment_status })
    setModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    if (editing) {
      await fetch('/api/stores', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
    } else {
      await fetch('/api/stores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    }
    setSaving(false)
    setModal(false)
    fetchStores()
  }

  const filtered = stores.filter(s => {
    const matchStatus = filter === 'all' || s.deployment_status === filter
    const matchSearch = !search || s.store_name.toLowerCase().includes(search.toLowerCase()) || s.sub_affiliate.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const title = partner ?? 'All Partners'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Store Directory</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title} · {stores.length} stores</p>
        </div>
        <div className="flex items-center gap-3">
          <input ref={bulkFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBulkFile(f) }} />
          <button onClick={() => bulkFileRef.current?.click()} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors">📤 Bulk Import</button>
          <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Store</button>
        </div>
      </div>

      {bulkResult && <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-400 px-4 py-3 rounded-lg mb-4 text-sm">{bulkResult}</div>}

      <div className="flex gap-3 mb-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search store or ID..." className="border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs" />
        <div className="flex gap-1">
          {['all', ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700 text-left">
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Store Name</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">DSP</th>
              {!partner && <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Partner</th>}
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={partner ? 4 : 5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={partner ? 4 : 5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No stores found.</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 dark:text-gray-100">{s.store_name}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{s.sub_affiliate}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.dsp || '—'}</td>
                {!partner && <td className="px-4 py-3">{s.partner ? <span className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs px-2 py-0.5 rounded">{s.partner}</span> : '—'}</td>}
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(s.deployment_status)}`}>{s.deployment_status}</span></td>
                <td className="px-4 py-3 text-right"><button onClick={() => openEdit(s)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4">{editing ? 'Edit Store' : 'Add Store'}</h2>
            <div className="space-y-3">
              {[
                { label: 'Sub Affiliate ID', key: 'sub_affiliate', disabled: !!editing },
                { label: 'Store Name', key: 'store_name' },
                { label: 'Partner', key: 'partner', disabled: !!partner },
                { label: 'DSP', key: 'dsp' },
              ].map(({ label, key, disabled }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
                  <input
                    value={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    disabled={disabled}
                    className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:disabled:bg-gray-600 dark:disabled:text-gray-500 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Deployment Status</label>
                <select value={form.deployment_status} onChange={(e) => setForm({ ...form, deployment_status: e.target.value })} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {bulkParsed.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Bulk Import Stores</h2>
            {(!subAffiliateKey || !storeNameKey) && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-400 text-sm px-4 py-2 rounded-lg mb-4">
                ⚠️ CSV must have <strong>Sub Affiliate</strong> and <strong>Store Name</strong> columns.
              </div>
            )}
            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Upload Mode</h3>
              <div className="flex gap-4 mb-2">
                <button onClick={() => { setBulkMode('new'); setBulkConfirming(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${bulkMode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>New Upload</button>
                <button onClick={() => { setBulkMode('update'); setBulkConfirming(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${bulkMode === 'update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>Update File</button>
              </div>
              {bulkMode === 'update' && <p className="text-xs text-amber-600">⚠️ This will replace the entire Store Directory — any store missing from this file will be deleted.</p>}
            </div>
            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Preview ({bulkParsed.length} rows)</h3>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700">
                      {['Sub Affiliate', 'Store Name', 'Partner', 'DSP', 'Deployment Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkParsed.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{subAffiliateKey ? row[subAffiliateKey] : '—'}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{storeNameKey ? row[storeNameKey] : '—'}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{partner || (partnerKey && row[partnerKey]) || '—'}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{(dspKey && row[dspKey]) || '—'}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{statusKey && STATUS_OPTIONS.includes(row[statusKey]) ? row[statusKey] : 'Not Deployed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bulkParsed.length > 10 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Showing 10 of {bulkParsed.length} rows</p>}
              </div>
            </div>
            {bulkError && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">❌ {bulkError}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={bulkConfirming ? () => setBulkConfirming(false) : handleBulkCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              {subAffiliateKey && storeNameKey && (
                <button onClick={handleBulkImportClick} disabled={bulkUploading}
                  className={bulkConfirming ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm'}>
                  {bulkUploading ? 'Importing...' : bulkConfirming ? 'Yes, Replace Directory' : `Import ${bulkParsed.length} Stores`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
