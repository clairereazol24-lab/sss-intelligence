'use client'
import { useEffect, useMemo, useState } from 'react'
import StorePicker, { type StoreOption } from './StorePicker'
import VisitDrawer from './VisitDrawer'
import type { VisitWithMetrics } from '@/lib/marketing-performance'

function fmt(n: number) {
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

function DeltaCell({ before, after, money }: { before: number; after: number; money: boolean }) {
  const delta = after - before
  return (
    <span className={delta >= 0 ? 'text-green-600' : 'text-red-500'}>
      {delta >= 0 ? '+' : ''}{money ? fmt(delta) : delta.toLocaleString()}
    </span>
  )
}

export default function MarketingEffortsPage() {
  const [visits, setVisits] = useState<VisitWithMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<VisitWithMetrics | null>(null)

  const [store, setStore] = useState<StoreOption | null>(null)
  const [dateVisit, setDateVisit] = useState(() => new Date().toISOString().slice(0, 10))
  const [marketingType, setMarketingType] = useState<'Community' | 'Booth Activation'>('Community')

  const fetchVisits = async () => {
    setLoading(true)
    const res = await fetch('/api/marketing-efforts')
    const data = await res.json()
    setVisits(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { fetchVisits() }, [])

  const handleSave = async () => {
    setError('')
    if (!store) { setError('Pick a store first.'); return }
    setSaving(true)
    const res = await fetch('/api/marketing-efforts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date_visit: dateVisit,
        partner: store.partner,
        dsp: store.dsp,
        sub_affiliate: store.sub_affiliate,
        sub_affiliate_name: store.store_name,
        marketing_type: marketingType,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Failed to save.')
      return
    }
    setModal(false)
    setStore(null)
    setDateVisit(new Date().toISOString().slice(0, 10))
    setMarketingType('Community')
    fetchVisits()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return visits
    return visits.filter(v =>
      v.sub_affiliate_name?.toLowerCase().includes(q) ||
      v.sub_affiliate?.toLowerCase().includes(q) ||
      v.partner?.toLowerCase().includes(q) ||
      v.marketing_type?.toLowerCase().includes(q)
    )
  }, [visits, search])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Marketing Performance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Store visits mapped to before/after SSS Data</p>
        </div>
        <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Visit</button>
      </div>

      <div className="mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search store, partner, or marketing type..." className="border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full max-w-sm" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '1000px' }}>
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700 text-left">
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Date Visit</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Store</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Partner</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Marketing Type</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium text-right">Deposit (Δ)</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium text-right">GGR (Δ)</th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium text-right">Members (Δ)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No visits logged yet.</td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} onClick={() => setSelected(v)} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{v.date_visit}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 dark:text-gray-100">{v.sub_affiliate_name || v.sub_affiliate}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{v.sub_affiliate}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.partner || '—'}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.marketing_type}</td>
                <td className="px-4 py-3 text-right"><DeltaCell before={v.before.deposit} after={v.after.deposit} money /></td>
                <td className="px-4 py-3 text-right"><DeltaCell before={v.before.ggr} after={v.after.ggr} money /></td>
                <td className="px-4 py-3 text-right"><DeltaCell before={v.before.members} after={v.after.members} money={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Add Store Visit</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Store *</label>
                <StorePicker value={store} onSelect={setStore} />
                {store && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{store.dsp ?? '—'} · {store.partner ?? '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Date Visit *</label>
                <input type="date" value={dateVisit} onChange={(e) => setDateVisit(e.target.value)} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Marketing Type *</label>
                <select value={marketingType} onChange={(e) => setMarketingType(e.target.value as 'Community' | 'Booth Activation')} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm">
                  <option value="Community">Community</option>
                  <option value="Booth Activation">Booth Activation</option>
                </select>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => { setModal(false); setError('') }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving || !store} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <VisitDrawer
          visit={selected}
          onClose={() => setSelected(null)}
          onDeleted={(id) => { setVisits(prev => prev.filter(v => v.id !== id)); setSelected(null) }}
        />
      )}
    </div>
  )
}
