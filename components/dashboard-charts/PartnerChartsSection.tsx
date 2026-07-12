'use client'
import { useEffect, useState } from 'react'
import StoreBreakdownTable from './StoreBreakdownTable'

const PARTNERS = ['Alpharus', 'Relevant Tech']

type SeriesPoint = {
  date: string
  registered_members: number | null
  effective_member: number | null
  total_deposit: number | null
  conversion_rate: number | null
  avg_deposit_per_member: number | null
  retention_7d: number | null
}

type StoreRow = {
  store_name: string
  registered_members: number
  active_member: number
  total_deposit: number
}

export default function PartnerChartsSection() {
  const [partner, setPartner] = useState(PARTNERS[0])
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [storeBreakdown, setStoreBreakdown] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/dashboard-charts?partner=${encodeURIComponent(partner)}`)
      .then(async res => {
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load charts')
        return res.json()
      })
      .then(json => {
        if (cancelled) return
        setSeries(json.series || [])
        setStoreBreakdown(json.storeBreakdown || [])
      })
      .catch(err => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [partner])

  const hasAnyData = series.some(s => s.registered_members !== null)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200">Store Breakdown</h2>
        <select
          value={partner}
          onChange={e => setPartner(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          {PARTNERS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-500 text-center py-8">{error}</p>
      ) : !hasAnyData ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No daily data yet for {partner}.</p>
      ) : (
        <StoreBreakdownTable stores={storeBreakdown} />
      )}
    </div>
  )
}
