'use client'
import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'

type Member = {
  username: string
  sub_affiliate: string
  sub_affiliate_name: string
  dsp: string | null
  status: string
  registered_time: string | null
  member_rank: string | null
  last_login_time: string | null
  first_deposit_amount: number
  deposit: number
  deposit_times: number
  withdraw: number
  withdraw_times: number
}

type Summary = { total: number; active: number; locked: number; disabled: number }

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const statusColor = (s: string) => {
  const v = (s || '').toLowerCase()
  if (v === 'active') return 'text-green-600'
  if (v === 'locked') return 'text-amber-500'
  if (v === 'disabled') return 'text-red-400'
  return 'text-gray-400'
}

export default function MembersClient({ partner }: { partner: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

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
      setMembers(data.members || [])
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
        dsp: row['DSP'] || row['Dsp'] || null,
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

  const filtered = search.trim()
    ? members.filter(m => {
        const q = search.toLowerCase()
        return (
          m.username.toLowerCase().includes(q) ||
          m.sub_affiliate.toLowerCase().includes(q) ||
          m.sub_affiliate_name.toLowerCase().includes(q) ||
          (m.dsp || '').toLowerCase().includes(q) ||
          (m.status || '').toLowerCase().includes(q)
        )
      })
    : members

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

      {summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 dark:bg-gray-800 dark:border-gray-700">
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

      <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700 dark:text-gray-200">
            Members {search && filtered.length !== members.length ? `(${filtered.length} of ${members.length})` : members.length > 0 ? `(${members.length})` : ''}
          </h2>
          {members.length > 0 && (
            <input
              type="text"
              placeholder="Search username, store, status..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          )}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No members yet — import a CSV above.</p>
        ) : (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="text-xs w-full">
              <thead className="sticky top-0">
                <tr className="bg-gray-50 dark:bg-gray-700">
                  {['Sub Affiliate', 'Store Name', 'DSP', 'Username', 'Status', 'Rank', 'Registered', 'Last Login', 'Deposit', 'Withdraw'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={`${m.username}-${i}`} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{m.sub_affiliate}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{m.sub_affiliate_name}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{m.dsp || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">{m.username}</td>
                    <td className={`px-3 py-2 font-medium ${statusColor(m.status)}`}>{m.status || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{m.member_rank || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(m.registered_time)}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(m.last_login_time)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{m.deposit > 0 ? fmt(m.deposit) : '—'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{m.withdraw > 0 ? fmt(m.withdraw) : '—'}</td>
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
