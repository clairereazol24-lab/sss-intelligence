'use client'
import { useState } from 'react'
import type { VisitWithMetrics } from '@/lib/marketing-performance'

function fmt(n: number) {
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

function MetricRow({ label, before, after, money }: { label: string; before: number; after: number; money: boolean }) {
  const delta = after - before
  const format = (n: number) => (money ? fmt(n) : n.toLocaleString())
  return (
    <div className="grid grid-cols-3 gap-2 items-center py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-sm text-gray-800 dark:text-gray-100 text-right">{format(before)}</div>
      <div className="text-sm text-right">
        <span className="text-gray-800 dark:text-gray-100">{format(after)}</span>
        <span className={`ml-2 text-xs ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          ({delta >= 0 ? '+' : ''}{format(delta)})
        </span>
      </div>
    </div>
  )
}

export default function VisitDrawer({ visit, onClose, onDeleted }: {
  visit: VisitWithMetrics
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const confirmDelete = async () => {
    setDeleteConfirmOpen(false)
    setDeleting(true)
    try {
      const res = await fetch(`/api/marketing-efforts/${visit.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDeleted(visit.id)
      } else {
        setDeleteError('Failed to delete.')
      }
    } catch {
      setDeleteError('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{visit.sub_affiliate_name || visit.sub_affiliate}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">{visit.sub_affiliate} · {visit.partner ?? '—'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Date Visit</p>
            <p className="text-sm text-gray-800 dark:text-gray-100">{visit.date_visit}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Marketing Type</p>
            <p className="text-sm text-gray-800 dark:text-gray-100">{visit.marketing_type}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">DSP</p>
            <p className="text-sm text-gray-800 dark:text-gray-100">{visit.dsp || '—'}</p>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-400 dark:text-gray-500 pb-2">
              <div>Metric</div>
              <div className="text-right">Before</div>
              <div className="text-right">After (Δ)</div>
            </div>
            <MetricRow label="Total Deposit" before={visit.before.deposit} after={visit.after.deposit} money />
            <MetricRow label="Total GGR" before={visit.before.ggr} after={visit.after.ggr} money />
            <MetricRow label="Registered Members" before={visit.before.members} after={visit.after.members} money={false} />
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Before: all SSS Data through {visit.date_visit}. After: overall total as of today,
            updates automatically as new data is uploaded.
          </p>
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-gray-700">
          {deleteError && <p className="text-xs text-red-600 mb-2">{deleteError}</p>}
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={deleting}
            className="w-full text-sm text-red-600 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete this visit'}
          </button>
        </div>
      </div>

      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirmOpen(false)}
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete this visit?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {visit.sub_affiliate_name || visit.sub_affiliate} — this can&apos;t be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setDeleteConfirmOpen(false)} className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-3 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
