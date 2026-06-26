'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Persists across navigation within the same browser session
let _cachedReport = ''

export default function AIReportPage() {
  const [generating, setGenerating] = useState(!_cachedReport)
  const [report, setReport] = useState(_cachedReport)
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (_cachedReport) return
    generate()
  }, [])

  const generate = async () => {
    _cachedReport = ''
    setGenerating(true)
    setReport('')
    setError('')

    try {
      const statusRes = await fetch('/api/ai-report?period=all')
      const status = await statusRes.json()

      if (!status.hasData) {
        setError('No performance data found. Upload data in SSS Data first.')
        setGenerating(false)
        return
      }

      if (status.cached && status.report) {
        _cachedReport = status.report
        setReport(status.report)
        setGenerating(false)
        return
      }
    } catch {
      // status check failed — fall through and attempt a fresh generation
    }

    const { data: perfData } = await supabase.from('performance_data').select('*')
    const { data: mData } = await supabase.from('marketing_efforts').select('*').order('date', { ascending: false }).limit(50)
    const marketingData = mData || []

    if (!perfData || perfData.length === 0) {
      setError('No performance data found. Upload data in SSS Data first.')
      setGenerating(false)
      return
    }

    try {
      const res = await fetch('/api/ai-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performanceData: perfData, marketingData, period: 'all' }),
      })

      if (!res.ok) {
        let message = 'Report generation failed'
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {}
        throw new Error(message)
      }

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

      _cachedReport = text
    } catch (err: any) {
      setError(err.message)
    }
    setGenerating(false)
  }

  const copyReport = () => navigator.clipboard.writeText(report)

  const renderInline = (text: string): React.ReactNode => {
    if (!text.includes('**')) return text
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return (
      <>
        {parts.map((part, i) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : part
        )}
      </>
    )
  }

  const renderReport = (text: string): React.ReactNode[] => {
    const lines = text.split('\n')
    const result: React.ReactNode[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      // Markdown table
      if (line.trim().startsWith('|')) {
        const tableLines: string[] = []
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i])
          i++
        }
        const rows = tableLines
          .filter(l => !l.trim().match(/^\|[\s\-|:]+\|$/))
          .map(l =>
            l.split('|')
              .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
              .map(c => c.trim())
          )
          .filter(r => r.length > 0)

        if (rows.length > 0) {
          result.push(
            <div key={`table-${i}`} className="overflow-x-auto my-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    {rows[0].map((cell, j) => (
                      <th key={j} className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1).map((row, j) => (
                    <tr key={j} className="border-b border-gray-100 dark:border-gray-700">
                      {row.map((cell, k) => (
                        <td key={k} className="px-3 py-2 text-gray-600 dark:text-gray-300">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        continue
      }

      // ## Heading → bold + italic
      if (line.startsWith('## ')) {
        result.push(
          <h2 key={i} className="text-base font-bold italic text-gray-800 dark:text-gray-100 mt-6 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700">
            {line.slice(3)}
          </h2>
        )
      }
      // ### Sub-heading → bold + italic
      else if (line.startsWith('### ')) {
        result.push(
          <h3 key={i} className="text-sm font-bold italic text-gray-700 dark:text-gray-200 mt-4 mb-1">
            {line.slice(4)}
          </h3>
        )
      }
      // Standalone **full line bold**
      else if (line.match(/^\*\*[^*]+\*\*$/)) {
        result.push(
          <p key={i} className="font-semibold text-gray-700 dark:text-gray-200 mt-3 text-sm">
            {line.slice(2, -2)}
          </p>
        )
      }
      // - list item → clean text, no dash
      else if (line.startsWith('- ')) {
        result.push(
          <p key={i} className="text-gray-600 dark:text-gray-300 text-sm ml-4 my-0.5">
            {renderInline(line.slice(2))}
          </p>
        )
      }
      // Empty line
      else if (line.trim() === '') {
        result.push(<div key={i} className="h-2" />)
      }
      // Regular paragraph with possible inline bold
      else {
        result.push(
          <p key={i} className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
            {renderInline(line)}
          </p>
        )
      }

      i++
    }

    return result
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">AI Report</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Automatic intelligence report covering all your store data.</p>
        </div>
        <div className="flex items-center gap-2">
          {report && !generating && (
            <button onClick={copyReport} className="border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              📋 Copy
            </button>
          )}
          {!generating && (
            <button onClick={generate} className="border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              ↺ Regenerate
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {(report || generating) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div ref={reportRef} className="max-w-4xl">
            {report
              ? renderReport(report)
              : <p className="text-gray-400 dark:text-gray-500 text-sm animate-pulse">Claude is analyzing your data...</p>
            }
          </div>
        </div>
      )}
    </div>
  )
}
