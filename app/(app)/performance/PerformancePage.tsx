'use client'
import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

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

type MemberRow = {
  username: string
  sub_affiliate: string
  sub_affiliate_name: string
  dsp: string | null
  status: string
  deposit: number
  withdraw: number
  ggr?: number
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

function nk(type: 'store' | 'dsp', key: string, partner: string) {
  return `${type}__${key}__${partner ?? ''}`
}

function NoteCell({ id, notesMap, onSave }: {
  id: string
  notesMap: Record<string, string>
  onSave: (id: string, value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(notesMap[id] ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setValue(notesMap[id] ?? '')
  }, [notesMap, id, editing])

  const handleSave = async () => {
    setSaving(true)
    await onSave(id, value)
    setSaving(false)
    setEditing(false)
  }

  const handleCancel = () => {
    setValue(notesMap[id] ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          className="w-full text-xs border border-blue-300 dark:border-blue-500 rounded px-1.5 py-1 resize-none focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2 py-0.5 rounded transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-0.5 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="text-xs cursor-pointer min-h-[24px] leading-relaxed"
    >
      {value
        ? <span className="text-gray-600 dark:text-gray-300">{value}</span>
        : <span className="text-gray-300 dark:text-gray-600 italic">Add note...</span>
      }
    </div>
  )
}

function StoreTable({ rows, metricLabel, metric, notesMap, onSaveNote }: {
  rows: StoreRow[]
  metricLabel: string
  metric: (s: StoreRow) => React.ReactNode
  notesMap: Record<string, string>
  onSaveNote: (id: string, value: string) => void
}) {
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-700 text-center">
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-8">#</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium">Store</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-20">DSP</th>
          <th className="px-3 py-2 text-gray-500 dark:text-gray-400 font-medium w-28">{metricLabel}</th>
          <th className="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium w-40 border-l border-gray-100 dark:border-gray-700">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={`${s.sub_affiliate}-${s.partner}`} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-center">
            <td className="px-2 py-2 text-gray-400 dark:text-gray-500 font-medium">{i + 1}</td>
            <td className="px-2 py-2">
              <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{s.store_name}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">{s.sub_affiliate}</div>
            </td>
            <td className="px-2 py-2 text-gray-600 dark:text-gray-300 truncate text-xs">{s.dsp || '—'}</td>
            <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{metric(s)}</td>
            <td className="px-4 py-2 border-l border-gray-50 dark:border-gray-700">
              <NoteCell id={nk('store', s.sub_affiliate, s.partner)} notesMap={notesMap} onSave={onSaveNote} />
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No data. Upload a CSV first.</td></tr>
        )}
      </tbody>
    </table>
  )
}

function MemberTable({ rows, metricLabel, metric }: {
  rows: MemberRow[]
  metricLabel: string
  metric: (m: MemberRow) => React.ReactNode
}) {
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-700 text-center">
          <th className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-medium w-8">#</th>
          <th className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-medium w-28">Username</th>
          <th className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-medium">Store</th>
          <th className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-medium w-20">DSP</th>
          <th className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-medium w-28">{metricLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m, i) => (
          <tr key={`${m.username}-${i}`} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-center">
            <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 font-medium">{i + 1}</td>
            <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-100">{m.username}</td>
            <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">{m.sub_affiliate_name || m.sub_affiliate}</td>
            <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">{m.dsp || '—'}</td>
            <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-100">{metric(m)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No member data. Import a CSV in the Members module first.</td></tr>
        )}
      </tbody>
    </table>
  )
}

function DSPTable({ rows, metricLabel, metric }: {
  rows: DSPRow[]
  metricLabel: string
  metric: (d: DSPRow) => React.ReactNode
}) {
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-700 text-center">
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-8">#</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium">DSP</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-28">Partner</th>
          <th className="px-2 py-2 text-gray-500 dark:text-gray-400 font-medium w-28">{metricLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d, i) => (
          <tr key={`${d.dsp}-${d.partner}`} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-center">
            <td className="px-2 py-2 text-gray-400 dark:text-gray-500 font-medium">{i + 1}</td>
            <td className="px-2 py-2 font-medium text-gray-800 dark:text-gray-100 truncate">{d.dsp}</td>
            <td className="px-2 py-2">
              {d.partner ? <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs px-2 py-0.5 rounded">{d.partner}</span> : '—'}
            </td>
            <td className="px-2 py-2 font-medium text-gray-800 dark:text-gray-100">{metric(d)}</td>
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

export default function PerformancePage({ partner }: { partner?: string }) {
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storesByMembers, setStoresByMembers] = useState<StoreRow[]>([])
  const [storesByGGR, setStoresByGGR] = useState<StoreRow[]>([])
  const [dspsByDeposit, setDSPsByDeposit] = useState<DSPRow[]>([])
  const [dspsByMembers, setDSPsByMembers] = useState<DSPRow[]>([])
  const [dspsByGGR, setDSPsByGGR] = useState<DSPRow[]>([])
  const [dsps, setDSPs] = useState<DSPRow[]>([])
  const [membersByDeposit, setMembersByDeposit] = useState<MemberRow[]>([])
  const [membersByGGR, setMembersByGGR] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(false)
  const [notesMap, setNotesMap] = useState<Record<string, string>>({})

  const buildUrl = (period: string) => {
    const params = new URLSearchParams({ period })
    if (partner) params.set('partner', partner)
    return `/api/performance?${params.toString()}`
  }

  const fetchData = async (period: string) => {
    setLoading(true)
    const partnerParam = partner ? `&partner=${encodeURIComponent(partner)}` : ''
    const [perfRes, memDepRes, memGGRRes] = await Promise.all([
      fetch(buildUrl(period)),
      fetch(`/api/members?top=deposit&full=true${partnerParam}`),
      fetch(`/api/members?top=ggr&full=true${partnerParam}`),
    ])
    const data = await perfRes.json()
    const memDep = await memDepRes.json()
    const memGGR = await memGGRRes.json()
    setStores(data.sortedStores || [])
    setStoresByMembers(data.sortedStoresByMembers || [])
    setStoresByGGR(data.sortedStoresByGGR || [])
    setDSPsByDeposit(data.sortedDSPsByDeposit || [])
    setDSPsByMembers(data.sortedDSPsByMembers || [])
    setDSPsByGGR(data.sortedDSPsByGGR || [])
    setDSPs(data.sortedDSPs || [])
    setMembersByDeposit(memDep.members || [])
    setMembersByGGR(memGGR.members || [])
    if (data.periods) setPeriods(data.periods)
    setLoading(false)
  }

  const fetchNotes = async () => {
    const res = await fetch('/api/notes')
    if (!res.ok) return
    const data: { entity_type: string; entity_key: string; partner: string; notes: string }[] = await res.json()
    const map: Record<string, string> = {}
    for (const n of data) map[nk(n.entity_type as 'store' | 'dsp', n.entity_key, n.partner)] = n.notes
    setNotesMap(map)
  }

  useEffect(() => {
    fetchData('all')
    fetchNotes()
  }, [partner])

  const handlePeriodChange = (p: string) => {
    setSelectedPeriod(p)
    fetchData(p)
  }

  const handleSaveNote = async (id: string, value: string) => {
    const [entity_type, entity_key, partner_val] = id.split('__')
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type, entity_key, partner: partner_val ?? '', notes: value }),
    })
    setNotesMap((prev) => ({ ...prev, [id]: value }))
  }

  const exportAll = () => {
    const wb = XLSX.utils.book_new()
    const addStore = (name: string, rows: StoreRow[], metricLabel: string, metricVal: (s: StoreRow) => string | number) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['#', 'Store', 'Sub-affiliate', 'DSP', metricLabel, 'Notes'],
        ...rows.map((s, i) => [i + 1, s.store_name, s.sub_affiliate, s.dsp || '', metricVal(s), notesMap[nk('store', s.sub_affiliate, s.partner)] ?? '']),
      ])
      XLSX.utils.book_append_sheet(wb, ws, name)
    }
    const addDSP = (name: string, rows: DSPRow[], metricLabel: string, metricVal: (d: DSPRow) => string | number) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['#', 'DSP', 'Partner', metricLabel],
        ...rows.map((d, i) => [i + 1, d.dsp, d.partner || '', metricVal(d)]),
      ])
      XLSX.utils.book_append_sheet(wb, ws, name)
    }
    addStore('Stores by Deposit',   stores,          'Total Deposit',      (s) => s.total_deposit)
    addStore('Stores by Members',   storesByMembers, 'Registered Members', (s) => s.registered_members)
    addStore('Stores by GGR',       storesByGGR,     'GGR',                (s) => s.company_net_win)
    addDSP(  'DSPs by Deposit',     dspsByDeposit,   'Total Deposit',      (d) => d.total_deposit)
    addDSP(  'DSPs by Members',     dspsByMembers,   'Registered Members', (d) => d.registered_members)
    addDSP(  'DSPs by GGR',         dspsByGGR,       'Total GGR',          (d) => d.total_grr)
    addDSP(  'DSPs by Store Count', dsps,            'Stores',             (d) => d.store_count)
    const label = partner ? partner.replace(' ', '_') : 'All'
    XLSX.writeFile(wb, `Performance_${label}_${selectedPeriod === 'all' ? 'All_Time' : selectedPeriod}.xlsx`)
  }

  const title = partner ?? 'All Partners'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Performance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title} · All stores and DSPs</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 shadow-sm"
          >
            <option value="all">All Time</option>
            {periods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            onClick={exportAll}
            disabled={loading}
            className="text-sm text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-50 font-medium px-4 py-2 rounded-lg transition-colors"
          >
            ↓ Export Data
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
          {/* Left column — DSP */}
          <div className="flex flex-col gap-6">
            <Card emoji="💰" title="DSPs by Deposit">
              <DSPTable rows={dspsByDeposit} metricLabel="Total Deposit" metric={(d) => fmt(d.total_deposit)} />
            </Card>
            <Card emoji="📊" title="DSPs by GGR">
              <DSPTable rows={dspsByGGR} metricLabel="Total GGR" metric={(d) => <span className={d.total_grr >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt(d.total_grr)}</span>} />
            </Card>
            <Card emoji="👥" title="DSPs by Registered Members">
              <DSPTable rows={dspsByMembers} metricLabel="Registered Members" metric={(d) => d.registered_members.toLocaleString()} />
            </Card>
            <Card emoji="👤" title="DSPs by Store Count">
              <DSPTable rows={dsps} metricLabel="Stores" metric={(d) => d.store_count.toLocaleString()} />
            </Card>
          </div>

          {/* Right column — Stores + Members */}
          <div className="flex flex-col gap-6">
            <Card emoji="🏆" title="Stores by Deposit">
              <StoreTable rows={stores} metricLabel="Total Deposit" metric={(s) => fmt(s.total_deposit)} notesMap={notesMap} onSaveNote={handleSaveNote} />
            </Card>
            <Card emoji="📈" title="Stores by GGR">
              <StoreTable rows={storesByGGR} metricLabel="GGR" metric={(s) => <span className={s.company_net_win >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt(s.company_net_win)}</span>} notesMap={notesMap} onSaveNote={handleSaveNote} />
            </Card>
            <Card emoji="⭐" title="Stores by Registered Members">
              <StoreTable rows={storesByMembers} metricLabel="Registered Members" metric={(s) => s.registered_members.toLocaleString()} notesMap={notesMap} onSaveNote={handleSaveNote} />
            </Card>
            <Card emoji="💵" title="Members by Deposit">
              <MemberTable rows={membersByDeposit} metricLabel="Deposit" metric={(m) => fmt(m.deposit)} />
            </Card>
            <Card emoji="📉" title="Members by GGR">
              <MemberTable rows={membersByGGR} metricLabel="GGR" metric={(m) => { const g = m.ggr ?? (m.deposit - m.withdraw); return <span className={g >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt(g)}</span> }} />
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
