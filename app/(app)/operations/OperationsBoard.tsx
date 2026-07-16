'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { OpsTask } from '@/lib/supabase'

type BoardTask = OpsTask & { collaborator_count: number; comment_count: number; unread_count: number }

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

export default function OperationsBoard() {
  const router = useRouter()
  const [tasks, setTasks] = useState<BoardTask[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', deadline: '' })
  const [saving, setSaving] = useState(false)

  const fetchTasks = async () => {
    const res = await fetch('/api/operations')
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setTasks(data.tasks || [])
    setIsAdmin(!!data.isAdmin)
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()

    const channel = supabase
      .channel('ops-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_tasks' }, () => fetchTasks())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create task.')
      }
      setModal(false)
      setForm({ title: '', description: '', priority: 'medium', deadline: '' })
      fetchTasks()
    } finally {
      setSaving(false)
    }
  }

  const visibleTasks = tasks.filter((t) => showArchived || !t.is_archived)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Operations</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Operational workspaces for SSS activities</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show Archived
          </label>
          {isAdmin && (
            <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + New Special Task
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTasks.map((t) => (
            <div
              key={t.id}
              onClick={() => router.push(`/operations/${t.id}`)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">{t.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[t.priority]}`}>
                  {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                </span>
              </div>
              {t.is_archived && <p className="text-xs text-gray-400 mb-2">Archived</p>}
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {t.unread_count > 0 && <span>🆕 New Update ({t.unread_count})</span>}
                <span>💬 Comments ({t.comment_count})</span>
                <span>👥 Collaborators ({t.collaborator_count})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4">New Special Task</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Deadline</label>
                  <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.title.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
