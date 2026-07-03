'use client'

import { useMemo, useState } from 'react'

function parseIds(raw: string): string[] {
  const pieces = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return Array.from(new Set(pieces))
}

export default function LockedRetailersClient() {
  const [raw, setRaw] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const ids = useMemo(() => parseIds(raw), [raw])

  const handleGenerate = async () => {
    setError(null)
    setResult(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/locked-retailers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subAffiliateIds: ids }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate report.')
      }
      const matchedCount = res.headers.get('X-Matched-Count') ?? '0'
      const notFoundCount = res.headers.get('X-Not-Found-Count') ?? '0'

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `locked-retailers-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setResult(
        Number(notFoundCount) > 0
          ? `✅ ${matchedCount} matched, ${notFoundCount} not found.`
          : `✅ ${matchedCount} matched.`
      )
    } catch (err: any) {
      setError(err.message || 'Failed to generate report.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">Shortcut</h1>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
        Paste locked Sub Affiliate IDs to download their all-time sales totals, ranked by DSP.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">
            Sub Affiliate IDs
          </h2>

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="One Sub Affiliate ID per line, or comma-separated"
            rows={18}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 font-mono resize-none"
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Parsed IDs
            </h2>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {ids.length} ID{ids.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto border border-gray-100 rounded-lg dark:border-gray-700 p-3 mb-4">
            {ids.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-8">
                Parsed IDs will appear here as you type.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ids.map((id) => (
                  <span
                    key={id}
                    className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 text-xs font-mono text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                  >
                    {id}
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
              ❌ {error}
            </div>
          )}

          {result && (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-400 px-4 py-3 rounded-lg mb-4 text-sm">
              {result}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={ids.length === 0 || generating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mt-auto"
          >
            {generating ? 'Generating…' : 'Generate & Download Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}
