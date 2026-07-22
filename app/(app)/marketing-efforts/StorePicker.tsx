'use client'
import { useEffect, useMemo, useState } from 'react'

export type StoreOption = {
  sub_affiliate: string
  store_name: string
  partner: string | null
  dsp: string | null
}

export default function StorePicker({ value, onSelect }: {
  value: StoreOption | null
  onSelect: (store: StoreOption | null) => void
}) {
  const [stores, setStores] = useState<StoreOption[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(d => setStores(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return stores.slice(0, 50)
    return stores
      .filter(s =>
        s.sub_affiliate?.toLowerCase().includes(q) ||
        s.store_name?.toLowerCase().includes(q)
      )
      .slice(0, 50)
  }, [stores, query])

  return (
    <div className="relative">
      <input
        value={value ? `${value.store_name} (${value.sub_affiliate})` : query}
        onChange={(e) => {
          if (value) onSelect(null)
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Search store name or sub affiliate..."
        className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No stores found.</div>
          ) : filtered.map(s => (
            <button
              key={`${s.sub_affiliate}__${s.partner}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(s); setQuery(''); setOpen(false) }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="font-medium text-gray-800 dark:text-gray-100">{s.store_name}</div>
              <div className="text-xs text-gray-400">{s.sub_affiliate} · {s.dsp ?? '—'} · {s.partner ?? '—'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
