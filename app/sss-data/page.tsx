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
  const fileRef = useRef<HTMLInputElement>(null)

  const [overallFrom, setOverallFrom] = useState('')
  const [overallTo, setOverallTo] = useState('')
  const [overallTotals, setOverallTotals] = useState<OverallTotals | null>(null)
  const [overallLoading, setOverallLoading] = useState(false)
  const [overallError, setOverallError] = useState<string | null>(null)

  const fetchOverall = async (from: string, to: string) => {
    setOverallLoading(true)
    setOverallError(null)
    try {
      const query = from && to ? `?from=${from}&to=${to}` : ''
      const res = await fetch(`/api/performance${query}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOverallTotals(data.overallTotals)
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

  const handleUpload = async () => {
    if (!parsed.length) return
    const period = getPeriod()
    if (!period || period.includes('undefined') || period === '-') {
      setError('Please select a valid period.')
      return
    }
    setUploading(true)
    setError(null)

    const partnerKey = headers.find(h => h.toLowerCase() === 'partner')
    const dspKey = headers.find(h => h.toLowerCase() === 'dsp')

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

  const months = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">SSS Data</h1>
          <p className="text-sm text-gray-500">Upload your sub-affiliate CSV export here.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={overallFrom}
            onChange={(e) => handleOverallFromChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={overallTo}
            onChange={(e) => handleOverallToChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
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
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg shadow-sm transition-colors text-sm whitespace-nowrap"
          >
            ⬇️ Export
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-6">{file ? `📄 ${file.name}` : 'No file selected — make sure to add Partner and DSP columns before uploading.'}</p>

      {/* Overall summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-700 mb-3">Overall</h2>
        {overallError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-3 text-sm">❌ {overallError}</div>
        )}
        {overallLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Total Deposit</p>
              <p className="font-semibold text-gray-800">{fmt(overallTotals?.total_deposit || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Total GGR</p>
              <p className={`font-semibold ${((overallTotals?.company_net_win || 0) >= 0) ? 'text-green-600' : 'text-red-500'}`}>{fmt(overallTotals?.company_net_win || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Registered Members</p>
              <p className="font-semibold text-gray-800">{(overallTotals?.registered_members || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Stores</p>
              <p className="font-semibold text-gray-800">{overallTotals?.store_count || 0}</p>
            </div>
          </div>
        )}
        {!overallLoading && !overallError && (overallTotals?.store_count || 0) === 0 && (
          <p className="text-xs text-gray-400 mt-3">No data yet — upload a CSV below.</p>
        )}
      </div>

      {/* Column warnings */}
      {parsed.length > 0 && (
        <div className="mb-4 space-y-2">
          {!hasPartner && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>Partner</strong> column detected. Add it to your CSV before uploading.</div>}
          {!hasDSP && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg">⚠️ No <strong>DSP</strong> column detected. Add it to your CSV before uploading.</div>}
          {hasPartner && hasDSP && <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg">✅ Partner and DSP columns detected.</div>}
        </div>
      )}

      {/* Period selector */}
      {parsed.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="font-semibold text-gray-700 mb-3">Select Period</h2>
          <div className="flex gap-4 mb-4">
            <button onClick={() => setPeriodType('monthly')} className={`px-4 py-2 rounded-lg text-sm font-medium ${periodType === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Monthly</button>
            <button onClick={() => setPeriodType('daily')} className={`px-4 py-2 rounded-lg text-sm font-medium ${periodType === 'daily' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Daily</button>
          </div>
          {periodType === 'monthly' ? (
            <div className="flex gap-3">
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Month</option>
                {months.map((m, i) => <option key={m} value={m}>{monthNames[i]}</option>)}
              </select>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {['2024','2025','2026','2027'].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : (
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          )}
        </div>
      )}

      {/* Preview */}
      {parsed.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="font-semibold text-gray-700 mb-3">Preview ({parsed.length} rows)</h2>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-gray-50">
                  {['Sub Affiliate', 'Sub Affiliate Name', 'Total Deposit', 'Company Net Win (GGR)', 'Partner', 'DSP'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{row['Sub Affiliate']}</td>
                    <td className="px-3 py-2 text-gray-700">{row['Sub Affiliate Name']}</td>
                    <td className="px-3 py-2 text-gray-700">{row['Total Deposit']}</td>
                    <td className="px-3 py-2 text-gray-700">{row['Company Net Win (GGR)']}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${row['Partner'] ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-500'}`}>{row['Partner'] || '—'}</span></td>
                    <td className="px-3 py-2 text-gray-700">{row['DSP'] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 10 && <p className="text-xs text-gray-400 mt-2">Showing 10 of {parsed.length} rows</p>}
          </div>
        </div>
      )}

      {result && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm">{result}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm">❌ {error}</div>}

      {parsed.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          {uploading ? 'Uploading...' : `Upload ${parsed.length} Records`}
        </button>
      )}
    </div>
  )
}
