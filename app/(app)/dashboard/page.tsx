'use client'
import { useState, useEffect } from 'react'

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Totals = {
  total_deposit: number
  company_net_win: number
  registered_members: number
  store_count: number
}

const PARTNERS = [
  { key: 'Alpharus', label: 'Alpharus' },
  { key: 'Relevant Tech', label: 'Relevant Tech' },
]

export default function DashboardPage() {
  const [totals, setTotals] = useState<Record<string, Totals | null>>({ Alpharus: null, 'Relevant Tech': null })
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const fetchAll = async (f: string, t: string) => {
    setLoading(true)
    try {
      const base = f && t ? `&from=${f}&to=${t}` : ''
      const results = await Promise.all(
        PARTNERS.map(p => fetch(`/api/performance?partner=${encodeURIComponent(p.key)}${base}`).then(r => r.json()))
      )
      const next: Record<string, Totals | null> = {}
      PARTNERS.forEach((p, i) => { next[p.key] = results[i].overallTotals || null })
      setTotals(next)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll('', '') }, [])

  const handleFrom = (v: string) => { setFrom(v); fetchAll(v, to) }
  const handleTo = (v: string) => { setTo(v); fetchAll(from, v) }

  const combined: Totals = PARTNERS.reduce((acc, p) => {
    const t = totals[p.key]
    return {
      total_deposit: acc.total_deposit + (t?.total_deposit || 0),
      company_net_win: acc.company_net_win + (t?.company_net_win || 0),
      registered_members: acc.registered_members + (t?.registered_members || 0),
      store_count: acc.store_count + (t?.store_count || 0),
    }
  }, { total_deposit: 0, company_net_win: 0, registered_members: 0, store_count: 0 })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Dashboard</h1>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={from}
            onChange={e => handleFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={to}
            onChange={e => handleTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Combined total */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">Combined</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total Deposit</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{loading ? '—' : fmt(combined.total_deposit)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total GGR</p>
            <p className={`text-lg font-bold ${combined.company_net_win >= 0 ? 'text-green-600' : 'text-red-500'}`}>{loading ? '—' : fmt(combined.company_net_win)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Registered Members</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{loading ? '—' : combined.registered_members.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Stores</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{loading ? '—' : combined.store_count}</p>
          </div>
        </div>
      </div>

      {/* Per-partner cards */}
      <div className="grid grid-cols-2 gap-4">
        {PARTNERS.map(p => {
          const t = totals[p.key]
          return (
            <div key={p.key} className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">{p.label}</h2>
              {loading ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center">Loading...</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total Deposit</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{fmt(t?.total_deposit || 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total GGR</p>
                    <p className={`font-semibold text-sm ${(t?.company_net_win || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(t?.company_net_win || 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Registered Members</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{(t?.registered_members || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Stores</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{t?.store_count || 0}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
