'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function AIReportPage() {
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [includeMarketing, setIncludeMarketing] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState('')
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('performance_data').select('period').order('period', { ascending: false })
      .then(({ data }) => {
        const unique = [...new Set((data || []).map((d: any) => d.period))]
        setPeriods(unique)
      })
  }, [])

  const generate = async () => {
    setGenerating(true)
    setReport('')
    setError('')

    // Fetch performance data
    let perfQuery = supabase.from('performance_data').select('*')
    if (selectedPeriod !== 'all') perfQuery = perfQuery.eq('period', selectedPeriod)
    const { data: perfData } = await perfQuery

    // Fetch marketing data
    let marketingData: any[] = []
    if (includeMarketing) {
      const { data: mData } = await supabase.from('marketing_efforts').select('*').order('date', { ascending: false }).limit(50)
      marketingData = mData || []
    }

    if (!perfData || perfData.length === 0) {
      setError('No performance data found for the selected period. Upload data in SSS Data first.')
      setGenerating(false)
      return
    }

    try {
      const res = await fetch('/api/ai-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performanceData: perfData, marketingData, period: selectedPeriod }),
      })

      if (!res.ok) throw new Error('Report generation failed')

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setReport(text)
        reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }
    } catch (err: any) {
      setError(err.message)
    }
    setGenerating(false)
  }

  const copyReport = () => {
    navigator.clipboard.writeText(report)
  }

  // Simple markdown-like renderer
  const renderReport = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-gray-800 mt-6 mb-2 pb-1 border-b border-gray-200">{line.slice(3)}</h2>
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-gray-700 mt-3">{line.slice(2, -2)}</p>
      if (line.startsWith('- ')) return <li key={i} className="ml-4 text-gray-600 text-sm list-disc">{line.slice(2)}</li>
      if (line === '') return <div key={i} className="h-1" />
      return <p key={i} className="text-gray-600 text-sm leading-relaxed">{line}</p>
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">AI Report</h1>
      <p className="text-sm text-gray-500 mb-6">Generate an intelligence report from your store data.</p>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Period</label>
            <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="all">All Time</option>
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={includeMarketing} onChange={(e) => setIncludeMarketing(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            Include marketing efforts data
          </label>
          <button
            onClick={generate}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {generating ? '⏳ Generating...' : '🤖 Generate Report'}
          </button>
          {report && !generating && (
            <button onClick={copyReport} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              📋 Copy
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Report output */}
      {(report || generating) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div ref={reportRef}>
            {report ? renderReport(report) : <p className="text-gray-400 text-sm animate-pulse">Claude is analyzing your data...</p>}
          </div>
        </div>
      )}

      {!report && !generating && (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">🤖</div>
          <p className="text-gray-500 text-sm">Select a period and click Generate Report to get your intelligence analysis.</p>
        </div>
      )}
    </div>
  )
}
