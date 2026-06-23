'use client'
import { useEffect, useState } from 'react'

type StoreRow = {
  sub_affiliate: string
  store_name: string
  partner: string
  dsp: string
  total_deposit: number
  company_net_win: number
  effective_member: number
  registered_members: number
}

type DSPRow = {
  dsp: string
  partner: string
  store_count: number
  total_deposit: number
  total_grr: number
}

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PerformancePage() {
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storesByMembers, setStoresByMembers] = useState<StoreRow[]>([])
  const [dsps, setDSPs] = useState<DSPRow[]>([])
  const [dspsByDeposit, setDSPsByDeposit] = useState<DSPRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async (period: string) => {
    setLoading(true)
    const res = await fetch(`/api/performance?period=${period}`)
    const data = await res.json()
    setStores(data.top20Stores || [])
    setStoresByMembers(data.top20StoresByMembers || [])
    setDSPs(data.top20DSPs || [])
    setDSPsByDeposit(data.top20DSPsByDeposit || [])
    if (data.periods) setPeriods(data.periods)
    setLoading(false)
  }

  useEffect(() => { fetchData('all') }, [])

  const handlePeriodChange = (p: string) => {
    setSelectedPeriod(p)
    fetchData(p)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Performance</h1>
          <p className="text-sm text-gray-500">Top 20 stores and DSPs by deposits</p>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => handlePeriodChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
        >
          <option value="all">All Time</option>
          {periods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Top 20 Stores */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">🏆 Top 20 Stores by Deposit</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Store</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">DSP</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">GGR</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s, i) => (
                    <tr key={s.sub_affiliate} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{s.store_name}</div>
                        <div className="text-xs text-gray-400">{s.sub_affiliate}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.dsp || '—'}</td>
                      <td className="px-4 py-3">
                        {s.partner ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{s.partner}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(s.total_deposit)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${s.company_net_win >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmt(s.company_net_win)}
                      </td>
                    </tr>
                  ))}
                  {stores.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 20 Stores by Registered Members */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">⭐ Top 20 Stores by Registered Members</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Store</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">DSP</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Registered Members</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {storesByMembers.map((s, i) => (
                    <tr key={s.sub_affiliate} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{s.store_name}</div>
                        <div className="text-xs text-gray-400">{s.sub_affiliate}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.dsp || '—'}</td>
                      <td className="px-4 py-3">
                        {s.partner ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{s.partner}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-700">{s.registered_members.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(s.total_deposit)}</td>
                    </tr>
                  ))}
                  {storesByMembers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 20 DSPs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">👤 Top 20 DSPs by Store Count</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">DSP</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-center">Stores</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total GGR</th>
                  </tr>
                </thead>
                <tbody>
                  {dsps.map((d, i) => (
                    <tr key={`${d.dsp}-${d.partner}`} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{d.dsp}</td>
                      <td className="px-4 py-3">
                        {d.partner ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{d.partner}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-gray-700">{d.store_count}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(d.total_deposit)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${d.total_grr >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(d.total_grr)}</td>
                    </tr>
                  ))}
                  {dsps.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 20 DSPs by Deposit */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">💰 Top 20 DSPs by Deposit</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">DSP</th>
                    <th className="px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-center">Stores</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
                    <th className="px-4 py-3 text-gray-500 font-medium text-right">Total GGR</th>
                  </tr>
                </thead>
                <tbody>
                  {dspsByDeposit.map((d, i) => (
                    <tr key={`${d.dsp}-${d.partner}`} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{d.dsp}</td>
                      <td className="px-4 py-3">
                        {d.partner ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{d.partner}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-gray-700">{d.store_count}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(d.total_deposit)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${d.total_grr >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(d.total_grr)}</td>
                    </tr>
                  ))}
                  {dspsByDeposit.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data. Upload a CSV first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
