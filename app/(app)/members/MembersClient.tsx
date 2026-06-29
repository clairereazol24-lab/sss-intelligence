'use client'
import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'

type MemberStoreRow = {
  sub_affiliate: string
  sub_affiliate_name: string
  total: number
  active: number
  locked: number
  disabled: number
}

type MemberSummary = {
  total: number
  active: number
  locked: number
  disabled: number
}

export default function MembersClient({ partner }: { partner: string }) {
  const [stores, setStores] = useState<MemberStoreRow[]>([])
  const [summary, setSummary] = useState<MemberSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchMembers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/members?partner=${encodeURIComponent(partner)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStores(data.byStore || [])
      setSummary(data.summary || null)
    } catch (err: any) {
      setError(err.message || 'Failed to load members.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMembers() }, [partner])

  const handleFile = (f: File) => {
    setFile(f)
    setResult(null)
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => setParsed(res.data as any[]),
    })
  }

  const handleUpload = async () => {
    if (!parsed.length) return
    setUploading(true)
    setError(null)
    try {
      const records = parsed.map((row: any) => ({
        partner: row['Partner'] || partner,
        sub_affiliate: row['Sub Affiliate'],
        sub_affiliate_name: row['Sub Affiliate Name'],
        channel: row['Channel'] || null,
        ad_name: row['AD Name'] || null,
        username: row['Username'],
        registered_time: row['Registered Time'] ? new Date(row['Registered Time']).toISOString() : null,
        status: row['Status'] || null,
        member_rank: row['Member Rank'] || null,
        last_login_time: row['Last Login Time'] ? new Date(row['Last Login Time']).toISOString() : null,
        first_deposit_amount: parseFloat(row['First Deposit Amount']) || 0,
        deposit: parseFloat(row['Deposit']) || 0,
        deposit_times: parseInt(row['Deposit Times']) || 0,
        withdraw: parseFloat(row['Withdraw']) || 0,
        withdraw_times: parseInt(row['Withdraw Times']) || 0,
      })).filter(r => r.username && r.sub_affiliate)

      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed.')
      setResult(`✅ ${data.count} member records uploaded.`)
      setParsed([])
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      fetchMembers()
    } catch (err: any) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">{partner}</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">Members</p>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            📥 Import Members
          </button>
        </div>
      </div>

      {/* Import confirmation bar */}
      {file && parsed.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-between dark:bg-blue-900/20 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">{file.name} — {parsed.length} rows ready</p>
          <div className="flex gap-2">
            <button onClick={() => { setFile(null); setParsed([]); if (fileRef.current) fileRef.current.value = '' }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded dark:text-gray-400">Cancel</button>
            <button onClick={handleUpload} disabled={uploading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {result && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6 text-sm dark:bg-green-900/30 dark:border-green-800 dark:text-green-400">{result}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">❌ {error}</div>}

      {/* Summary totals */}
      {summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 dark:bg-gray-800 dark:border-gray-700">
          <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Overall</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total Members</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{summary.total.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Active</p>
              <p className="text-lg font-bold text-green-600">{summary.active.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Locked</p>
              <p className="text-lg font-bold text-amber-500">{summary.locked.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Disabled</p>
              <p className="text-lg font-bold text-red-400">{summary.disabled.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Per-store table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">By Store</h2>
        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        ) : stores.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No member data yet — import a CSV above.</p>
        ) : (
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="text-xs w-full">
              <thead className="sticky top-0">
                <tr className="bg-gray-50 dark:bg-gray-700">
                  {['Sub Affiliate', 'Store Name', 'Total', 'Active', 'Locked', 'Disabled'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stores.map(s => (
                  <tr key={s.sub_affiliate} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.sub_affiliate}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.sub_affiliate_name}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{s.total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-green-600">{s.active.toLocaleString()}</td>
                    <td className="px-3 py-2 text-amber-500">{s.locked.toLocaleString()}</td>
                    <td className="px-3 py-2 text-red-400">{s.disabled > 0 ? s.disabled.toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
