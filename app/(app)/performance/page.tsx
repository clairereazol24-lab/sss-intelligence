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
  registered_members: number
}

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function StoreTable({ rows, metricLabel, metric }: { rows: StoreRow[]; metricLabel: string; metric: (s: StoreRow) => React.ReactNode }) {
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-700 text-left">
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-[8%]">#</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-[42%]">Store</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-[22%]">DSP</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium text-right w-[28%]">{metricLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.sub_affiliate} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
            <td className="px-2 py-2 text-gray-400 dark:text-gray-500 font-medium">{i + 1}</td>
            <td className="px-2 py-2">
              <div className="font-medium text-gray-800 dark:text-gray-100">{s.store_name}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">{s.sub_affiliate}</div>
            </td>
            <td className="px-2 py-2 text-gray-600 dark:text-gray-300 truncate">{s.dsp || '—'}</td>
            <td className="px-2 py-2 text-right font-medium text-gray-800 dark:text-gray-100">{metric(s)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No data. Upload a CSV first.</td></tr>
        )}
      </tbody>
    </table>
  )
}

function DSPTable({ rows, metricLabel, metric }: { rows: DSPRow[]; metricLabel: string; metric: (d: DSPRow) => React.ReactNode }) {
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-700 text-left">
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-[8%]">#</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-[30%]">DSP</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-[27%]">Partner</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium text-right w-[35%]">{metricLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d, i) => (
          <tr key={`${d.dsp}-${d.partner}`} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
            <td className="px-2 py-2 text-gray-400 dark:text-gray-500 font-medium">{i + 1}</td>
            <td className="px-2 py-2 font-medium text-gray-800 dark:text-gray-100 truncate">{d.dsp}</td>
            <td className="px-2 py-2 truncate">
              {d.partner ? <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs px-2 py-0.5 rounded">{d.partner}</span> : '—'}
            </td>
            <td className="px-2 py-2 text-right font-medium text-gray-800 dark:text-gray-100">{metric(d)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No data. Upload a CSV first.</td></tr>
        )}
      </tbody>
    </table>
  )
}

function Card({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200 text-sm">{emoji} {title}</h2>
      </div>
      <div className="overflow-x-auto overflow-y-auto max-h-[520px]">{children}</div>
    </div>
  )
}

export default function PerformancePage() {
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storesByMembers, setStoresByMembers] = useState<StoreRow[]>([])
  const [storesByGGR, setStoresByGGR] = useState<StoreRow[]>([])
  const [dspsByDeposit, setDSPsByDeposit] = useState<DSPRow[]>([])
  const [dspsByMembers, setDSPsByMembers] = useState<DSPRow[]>([])
  const [dspsByGGR, setDSPsByGGR] = useState<DSPRow[]>([])
  const [dsps, setDSPs] = useState<DSPRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async (period: string) => {
    setLoading(true)
    const res = await fetch(`/api/performance?period=${period}`)
    const data = await res.json()
    setStores(data.top50Stores || [])
    setStoresByMembers(data.top50StoresByMembers || [])
    setStoresByGGR(data.top50StoresByGGR || [])
    setDSPsByDeposit(data.top50DSPsByDeposit || [])
    setDSPsByMembers(data.top50DSPsByMembers || [])
    setDSPsByGGR(data.top50DSPsByGGR || [])
    setDSPs(data.top50DSPs || [])
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
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Performance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Top 50 stores and DSPs by deposits</p>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => handlePeriodChange(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 shadow-sm"
        >
          <option value="all">All Time</option>
          {periods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card emoji="🏆" title="Top 50 Stores by Deposit">
            <StoreTable rows={stores} metricLabel="Total Deposit" metric={(s) => fmt(s.total_deposit)} />
          </Card>

          <Card emoji="⭐" title="Top 50 Stores by Registered Members">
            <StoreTable rows={storesByMembers} metricLabel="Registered Members" metric={(s) => s.registered_members.toLocaleString()} />
          </Card>

          <Card emoji="📈" title="Top 50 Stores by GGR">
            <StoreTable
              rows={storesByGGR}
              metricLabel="GGR"
              metric={(s) => <span className={s.company_net_win >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt(s.company_net_win)}</span>}
            />
          </Card>

          <Card emoji="💰" title="Top 50 DSPs by Deposit">
            <DSPTable rows={dspsByDeposit} metricLabel="Total Deposit" metric={(d) => fmt(d.total_deposit)} />
          </Card>

          <Card emoji="👥" title="Top 50 DSPs by Registered Members">
            <DSPTable rows={dspsByMembers} metricLabel="Registered Members" metric={(d) => d.registered_members.toLocaleString()} />
          </Card>

          <Card emoji="📊" title="Top 50 DSPs by GGR">
            <DSPTable
              rows={dspsByGGR}
              metricLabel="Total GGR"
              metric={(d) => <span className={d.total_grr >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt(d.total_grr)}</span>}
            />
          </Card>

          <Card emoji="👤" title="Top 50 DSPs by Store Count">
            <DSPTable rows={dsps} metricLabel="Stores" metric={(d) => d.store_count.toLocaleString()} />
          </Card>
        </div>
      )}
    </div>
  )
}
