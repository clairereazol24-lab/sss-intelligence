'use client'
import { useState, useEffect } from 'react'
import PartnerChartsSection from '@/components/dashboard-charts/PartnerChartsSection'

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type PerfTotals = {
  total_deposit: number
  company_net_win: number
  store_count: number
}

type MemberCounts = {
  total: number
  active: number
  locked: number
  disabled: number
}

type TopMember = {
  username: string
  dsp: string | null
  deposit: number
  withdraw: number
}

const PARTNERS = [
  { key: 'Alpharus', label: 'Alpharus' },
  { key: 'Relevant Tech', label: 'Relevant Tech' },
]

export default function DashboardPage() {
  const [perf, setPerf] = useState<Record<string, PerfTotals | null>>({ Alpharus: null, 'Relevant Tech': null })
  const [memberCounts, setMemberCounts] = useState<Record<string, MemberCounts | null>>({ Alpharus: null, 'Relevant Tech': null })
  const [top50, setTop50] = useState<TopMember[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const fetchAll = async (f: string, t: string) => {
    setLoading(true)
    try {
      const base = f && t ? `&from=${f}&to=${t}` : ''
      const [perfResults, memberResults, top50Res] = await Promise.all([
        Promise.all(PARTNERS.map(p => fetch(`/api/performance?partner=${encodeURIComponent(p.key)}${base}`).then(r => r.json()))),
        Promise.all(PARTNERS.map(p => fetch(`/api/members?partner=${encodeURIComponent(p.key)}&summary=true${base}`).then(r => r.json()))),
        fetch(`/api/members?top=deposit${base}`).then(r => r.json()),
      ])
      const nextPerf: Record<string, PerfTotals | null> = {}
      const nextMem: Record<string, MemberCounts | null> = {}
      PARTNERS.forEach((p, i) => {
        nextPerf[p.key] = perfResults[i].overallTotals || null
        nextMem[p.key] = memberResults[i].summary || null
      })
      setPerf(nextPerf)
      setMemberCounts(nextMem)
      setTop50(top50Res.members || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll('', '') }, [])

  const handleFrom = (v: string) => { setFrom(v); fetchAll(v, to) }
  const handleTo = (v: string) => { setTo(v); fetchAll(from, v) }

  const combinedDeposit = PARTNERS.reduce((acc, p) => acc + (perf[p.key]?.total_deposit || 0), 0)
  const combinedGGR = PARTNERS.reduce((acc, p) => acc + (perf[p.key]?.company_net_win || 0), 0)
  const combinedMembers = PARTNERS.reduce((acc, p) => acc + (memberCounts[p.key]?.total || 0), 0)
  const combinedStores = PARTNERS.reduce((acc, p) => acc + (perf[p.key]?.store_count || 0), 0)

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

      {/* Combined */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">Combined</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total Deposit</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{loading ? '—' : fmt(combinedDeposit)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total GGR</p>
            <p className={`text-lg font-bold ${combinedGGR >= 0 ? 'text-green-600' : 'text-red-500'}`}>{loading ? '—' : fmt(combinedGGR)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Registered Members</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{loading ? '—' : combinedMembers.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Stores</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{loading ? '—' : combinedStores}</p>
          </div>
        </div>
      </div>

      {/* Per-partner */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {PARTNERS.map(p => {
          const t = perf[p.key]
          const m = memberCounts[p.key]
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
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{(m?.total || 0).toLocaleString()}</p>
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

      <PartnerChartsSection />

      {/* Top 50 Members */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">Top 50 Members by Deposit</h2>
        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        ) : top50.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No member data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700">
                  <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium w-8">#</th>
                  <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">DSP</th>
                  <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Username</th>
                  <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Deposit</th>
                  <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Withdraw</th>
                  <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">GGR</th>
                </tr>
              </thead>
              <tbody>
                {top50.map((m, i) => {
                  const ggr = (m.deposit || 0) - (m.withdraw || 0)
                  return (
                    <tr key={m.username} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-2.5 text-center text-gray-400 dark:text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400">{m.dsp || '—'}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300 font-medium">{m.username}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{fmt(m.deposit || 0)}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{fmt(m.withdraw || 0)}</td>
                      <td className={`px-3 py-2.5 text-center font-medium ${ggr >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(ggr)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
