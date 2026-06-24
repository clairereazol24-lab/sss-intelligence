'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Effort = {
  id: string
  date: string
  location: string
  store_name: string
  sub_affiliate: string
  activities_done: string
  headcount: number
  total_deposit: number
  notes: string
  report_file_url: string | null
  report_file_name: string | null
  report_file_type: string | null
}

export default function MarketingEffortsPage() {
  const [efforts, setEfforts] = useState<Effort[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: '', location: '', store_name: '', sub_affiliate: '', activities_done: '', headcount: '', total_deposit: '', notes: '' })
  const [search, setSearch] = useState('')
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')

  const handleFileSelect = (f: File | null) => {
    setFileError('')
    if (!f) { setReportFile(null); return }
    const ext = f.name.toLowerCase().split('.').pop()
    if (ext !== 'pdf' && ext !== 'docx') {
      setFileError('Only .pdf and .docx files are supported.')
      setReportFile(null)
      return
    }
    setReportFile(f)
  }

  const fetchEfforts = async () => {
    setLoading(true)
    const res = await fetch('/api/marketing')
    const data = await res.json()
    setEfforts(data)
    setLoading(false)
  }

  useEffect(() => { fetchEfforts() }, [])

  const handleSave = async () => {
    setSaving(true)

    let report_file_url: string | null = null
    let report_file_name: string | null = null
    let report_file_type: string | null = null

    if (reportFile) {
      const ext = reportFile.name.toLowerCase().split('.').pop()
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('marketing-reports').upload(path, reportFile)
      if (uploadError) {
        setFileError(`Upload failed: ${uploadError.message}`)
        setSaving(false)
        return
      }
      const { data: urlData } = supabase.storage.from('marketing-reports').getPublicUrl(path)
      report_file_url = urlData.publicUrl
      report_file_name = reportFile.name
      report_file_type = ext || null
    }

    await fetch('/api/marketing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        headcount: parseInt(form.headcount) || 0,
        total_deposit: parseFloat(form.total_deposit) || 0,
        report_file_url,
        report_file_name,
        report_file_type,
      }),
    })
    setSaving(false)
    setModal(false)
    setForm({ date: '', location: '', store_name: '', sub_affiliate: '', activities_done: '', headcount: '', total_deposit: '', notes: '' })
    setReportFile(null)
    setFileError('')
    fetchEfforts()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    await fetch(`/api/marketing?id=${id}`, { method: 'DELETE' })
    fetchEfforts()
  }

  const filtered = efforts.filter(e =>
    !search ||
    e.store_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.location?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Marketing Efforts</h1>
          <p className="text-sm text-gray-500">Booth activations and field activities</p>
        </div>
        <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Entry</button>
      </div>

      <div className="mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by store or location..." className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full max-w-xs" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-gray-500 font-medium">Date</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Store</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Location</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Activities</th>
              <th className="px-4 py-3 text-gray-500 font-medium text-center">Registration</th>
              <th className="px-4 py-3 text-gray-500 font-medium text-right">Total Deposit</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Notes</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Report</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No entries yet. Add your first booth activation.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.date}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{e.store_name || '—'}</div>
                  {e.sub_affiliate && <div className="text-xs text-gray-400">{e.sub_affiliate}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600">{e.location || '—'}</td>
                <td className="px-4 py-3 text-gray-600 max-w-xs">
                  <p className="truncate">{e.activities_done || '—'}</p>
                </td>
                <td className="px-4 py-3 text-center font-medium text-gray-700">{e.headcount}</td>
                <td className="px-4 py-3 text-right text-gray-700">₱{(e.total_deposit || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs">
                  <p className="truncate text-xs">{e.notes || '—'}</p>
                </td>
                <td className="px-4 py-3">
                  {e.report_file_url ? (
                    <a href={e.report_file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs whitespace-nowrap">📄 View Report</a>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-gray-800 mb-4">Add Marketing Entry</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Date *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Registration</label>
                  <input type="number" value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Total Deposit</label>
                <input type="number" value={form.total_deposit} onChange={(e) => setForm({ ...form, total_deposit: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {[
                { label: 'Store Name', key: 'store_name' },
                { label: 'Sub Affiliate ID', key: 'sub_affiliate' },
                { label: 'Location', key: 'location' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
                  <input value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Activities Done</label>
                <textarea value={form.activities_done} onChange={(e) => setForm({ ...form, activities_done: e.target.value })} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Report File (.pdf or .docx)</label>
                <input type="file" accept=".pdf,.docx" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} className="w-full text-sm" />
                {reportFile && <p className="text-xs text-gray-500 mt-1">Selected: {reportFile.name}</p>}
                {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => { setModal(false); setReportFile(null); setFileError('') }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.date} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
