'use client'
import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'

const REQUIRED_COLS = ['Sub Affiliate', 'Sub Affiliate Name', 'Total Deposit', 'Total Withdraw',
  'Valid Bet Amount', 'Company Net Win (GGR)', 'Payout Amount', 'Total Promotion Amount',
  'Registered Members', 'First Deposit Amount', 'First Deposit Count',
  'Deposit Member Count', 'Number of Members Withdrawn', 'Effective Member']

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type OverallTotals = {
  total_deposit: number
  total_withdraw: number
  company_net_win: number
  registered_members: number
  deposit_member_count: number
  effective_member: number
  store_count: number
}

type StoreRow = {
  sub_affiliate: string
  store_name: string
  partner: string | null
  dsp: string | null
  total_deposit: number
  total_withdraw: number
  valid_bet_amount: number
  company_net_win: number
  payout_amount: number
  registered_members: number
}

type LastUpdated = {
  period: string
  period_type: string
}

export default function SSSDataPage() {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [periodType, setPeriodType] = useState<'monthly' | 'daily'>('monthly')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [date, setDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasPartner, setHasPartner] = useState(false)
  const [hasDSP, setHasDSP] = useState(false)
  const [mode, setMode] = useState<'new' | 'update'>('new')
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [overallFrom, setOverallFrom] = useState('')
  const [overallTo, setOverallTo] = useState('')
  const [overallTotals, setOverallTotals] = useState<OverallTotals | null>(null)
  const [overallLoading, setOverallLoading] = useState(false)
  const [overallError, setOverallError] = useState<string | null>(null)
  const [allStores, setAllStores] = useState<StoreRow[]>([])
  const [lastUpdated, setLastUpdated] = useState<LastUpdated | null>(null)

  const fetchOverall = async (from: string, to: string) => {
    setOverallLoading(true)
    setOverallError(null)
    try {
      const query = from && to ? `?from=${from}&to=${to}` : ''
      const res = await fetch(`/api/performance${query}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOverallTotals(data.overallTotals)
      setAllStores(data.allStores || [])
      setLastUpdated(data.lastUpdated || null)
    } catch (err: any) {
      setOverallError(err.message || 'Failed to load overall totals.')
    } finally {
      setOverallLoading(false)
    }
  }

  useEffect(() => { fetchOverall('', '') }, [])

  const handleOverallFromChange = (value: string) => {
    setOverallFrom(value)
    fetchOverall(value, overallTo)
  }

  const handleOverallToChange = (value: string) => {
    setOverallTo(value)
    fetchOverall(overallFrom, value)
  }

  const handleExport = async () => {
    setOverallError(null)
    try {
      const query = overallFrom && overallTo ? `?from=${overallFrom}&to=${overallTo}` : ''
      const res = await fetch(`/api/export${query}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Export failed.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'performance_data.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setOverallError(err.message || 'Export failed.')
    }
  }

  const handleFile = (f: File) => {
    setFile(f)
    setResult(null)
    setError(null)
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = res.meta.fields || []
        setHeaders(cols)
        setParsed(res.data as any[])
        setHasPartner(cols.some(c => c.toLowerCase() === 'partner'))
        setHasDSP(cols.some(c => c.toLowerCase() === 'dsp'))
      },
    })
  }

  const getPeriod = () => {
    if (periodType === 'monthly') return `${year}-${month.padStart(2, '0')}`
    return date
  }

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

  const months = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const partnerKey = headers.find(h => h.toLowerCase() === 'partner')
  const dspKey = headers.find(h => h.toLowerCase() === 'dsp')

  const formatLastUpdated = (lu: LastUpdated | null) => {
    if (!lu) return null
    if (lu.period_type === 'monthly') {
      const [y, m] = lu.period.split('-')
      return `${monthNames[parseInt(m, 10) - 1]} ${y}`
    }
    return new Date(lu.period + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">SSS Data</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={overallFrom}
            onChange={(e) => handleOverallFromChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <span className="text-gray-400 dark:text-gray-500 text-sm">to</span>
          <input
            type="date"
            value={overallTo}
            onChange={(e) => handleOverallToChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            📤 Import
          </button>
          <button
            onClick={handleExport}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg shadow-sm transition-colors text-sm whitespace-nowrap dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
          >
            ⬇️ Export
          </button>
        </div>
      </div>

      {/* Overall summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 dark:bg-gray-800 dark:border-gray-700">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Overall</h2>
        {overallError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-3 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">❌ {overallError}</div>
        )}
        {overallLoading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total Deposit</p>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{fmt(overallTotals?.total_deposit || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total GGR</p>
              <p className={`font-semibold ${((overallTotals?.company_net_win || 0) >= 0) ? 'text-green-600' : 'text-red-500'}`}>{fmt(overallTotals?.company_net_win || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Registered Members</p>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{(overallTotals?.registered_members || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Stores</p>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{overallTotals?.store_count || 0}</p>
            </div>
          </div>
        )}
        {!overallLoading && !overallError && (overallTotals?.store_count || 0) === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">No data yet — upload a CSV below.</p>
        )}
      </div>

      {lastUpdated && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6 text-center">Last updated: {formatLastUpdated(lastUpdated)}</p>
      )}

      {/* Store Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 dark:bg-gray-800 dark:border-gray-700">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Store Summary</h2>
        {!overallLoading && !overallError && allStores.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No data yet — upload a CSV below.</p>
        )}
        {allStores.length > 0 && (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700">
                  {['Partner', 'DSP', 'Sub Affiliate', 'Sub Affiliate Name', 'Total Deposit', 'Total Withdraw', 'Valid Bet Amount', 'Company Net Win (GGR)', 'Payout Amount', 'Registered Members'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allStores.map((s) => (
                  <tr key={s.sub_affiliate} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.partner || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.dsp || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.sub_affiliate}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.store_name}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(s.total_deposit)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(s.total_withdraw)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(s.valid_bet_amount)}</td>
                    <td className={`px-3 py-2 font-medium ${s.company_net_win >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(s.company_net_win)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(s.payout_amount)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.registered_members.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {result && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm dark:bg-green-900/30 dark:border-green-800 dark:text-green-400">{result}</div>}

      {parsed.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl dark:bg-gray-800">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Import {file?.name}</h2>

            {/* Column warnings */}
            <div className="mb-4 space-y-2">
              {!hasPartner && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-400">⚠️ No <strong>Partner</strong> column detected. Add it to your CSV before uploading.</div>}
              {!hasDSP && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-400">⚠️ No <strong>DSP</strong> column detected. Add it to your CSV before uploading.</div>}
              {hasPartner && hasDSP && <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg dark:bg-green-900/30 dark:border-green-800 dark:text-green-400">✅ Partner and DSP columns detected.</div>}
            </div>

            {/* Upload mode */}
            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Upload Mode</h3>
              <div className="flex gap-4 mb-2">
                <button onClick={() => { setMode('new'); setConfirming(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>New Upload</button>
                <button onClick={() => { setMode('update'); setConfirming(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>Update File</button>
              </div>
              {mode === 'update' && (
                <p className="text-xs text-amber-600">⚠️ This will replace data for the selected period — any store missing from this file will be removed from that period.</p>
              )}
            </div>

            {/* Period selector */}
            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Select Period</h3>
              <div className="flex gap-4 mb-4">
                <button onClick={() => setPeriodType('monthly')} className={`px-4 py-2 rounded-lg text-sm font-medium ${periodType === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>Monthly</button>
                <button onClick={() => setPeriodType('daily')} className={`px-4 py-2 rounded-lg text-sm font-medium ${periodType === 'daily' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>Daily</button>
              </div>
              {periodType === 'monthly' ? (
                <div className="flex gap-3">
                  <select value={month} onChange={(e) => setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                    <option value="">Month</option>
                    {months.map((m, i) => <option key={m} value={m}>{monthNames[i]}</option>)}
                  </select>
                  <select value={year} onChange={(e) => setYear(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                    {['2024','2025','2026','2027'].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              ) : (
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              )}
            </div>

            {/* Preview */}
            <div className="mb-5">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Preview ({parsed.length} rows)</h3>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700">
                      {['Sub Affiliate', 'Sub Affiliate Name', 'Total Deposit', 'Company Net Win (GGR)', 'Partner', 'DSP'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row['Sub Affiliate']}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row['Sub Affiliate Name']}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row['Total Deposit']}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row['Company Net Win (GGR)']}</td>
                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${(partnerKey && row[partnerKey]) ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400'}`}>{(partnerKey && row[partnerKey]) || '—'}</span></td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{(dspKey && row[dspKey]) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 10 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Showing 10 of {parsed.length} rows</p>}
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">❌ {error}</div>}

            <div className="flex gap-2 justify-end">
              <button onClick={confirming ? () => setConfirming(false) : handleCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
              <button
                onClick={handleUploadClick}
                disabled={uploading}
                className={confirming ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm'}
              >
                {uploading ? 'Uploading...' : confirming ? 'Yes, Replace Data' : `Upload ${parsed.length} Records`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
