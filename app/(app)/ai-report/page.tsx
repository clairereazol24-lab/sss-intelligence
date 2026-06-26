'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function AIReportPage() {
  const [generating, setGenerating] = useState(true)
  const [report, setReport] = useState('')
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => { generate() }, [])

  const generate = async () => {
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
      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-gray-800 dark:text-gray-100 mt-6 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700">{line.slice(3)}</h2>
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-gray-700 dark:text-gray-200 mt-3">{line.slice(2, -2)}</p>
      if (line.startsWith('- ')) return <li key={i} className="ml-4 text-gray-600 dark:text-gray-300 text-sm list-disc">{line.slice(2)}</li>
      if (line === '') return <div key={i} className="h-1" />
      return <p key={i} className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">{line}</p>
    })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">AI Report</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Automatic intelligence report covering all your store data.</p>
        </div>
        {report && !generating && (
          <button onClick={copyReport} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700">
            📋 Copy
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">{error}</div>}

      {(report || generating) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
          <div ref={reportRef} className="max-w-4xl">
            {report ? renderReport(report) : <p className="text-gray-400 text-sm animate-pulse dark:text-gray-500">Claude is analyzing your data...</p>}
          </div>
        </div>
      )}
    </div>
  )
}
