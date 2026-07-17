'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { OpsTask } from '@/lib/supabase'
import TaskDetailClient from './[id]/TaskDetailClient'

type BoardTask = OpsTask & { collaborator_count: number; comment_count: number; unread_count: number }

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

export default function OperationsBoard({
  initialSelectedId,
  initialTasks,
  initialIsAdmin,
}: {
  initialSelectedId?: string
  initialTasks?: BoardTask[]
  initialIsAdmin?: boolean
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null)
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks ?? [])
  const [loading, setLoading] = useState(!initialTasks)
  const [isAdmin, setIsAdmin] = useState(!!initialIsAdmin)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', deadline: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
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
      setError(null)
      setModal(false)
      setForm({ title: '', description: '', priority: 'medium', deadline: '' })
      fetchTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.')
    } finally {
      setSaving(false)
    }
  }

  const visibleTasks = tasks.filter((t) => !t.is_archived)

  const selectTask = (id: string) => {
    setSelectedId(id)
    router.push(`/operations/${id}`, { scroll: false })
  }

  const closeTask = () => {
    setSelectedId(null)
    router.push('/operations', { scroll: false })
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Operations</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Operational workspaces for SSS activities</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + New Special Task
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="w-full md:w-80 space-y-4 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-16 bg-gray-100 dark:bg-gray-800 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 gap-4">
          <div className={`w-full md:w-80 flex-shrink-0 overflow-y-auto pr-1 ${selectedId ? 'hidden md:block' : 'block'}`}>
            {visibleTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => selectTask(t.id)}
                className={`border-b border-gray-100 dark:border-gray-800 py-3 px-2 cursor-pointer transition-colors ${
                  selectedId === t.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">{t.title}</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[t.priority]}`}>
                    {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                  </span>
                  {t.unread_count > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                      New Updates
                    </span>
                  )}
                  {t.is_archived && <span className="text-xs text-gray-400">Archived</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-2">
                  <span>💬 {t.comment_count}</span>
                  <span>👥 {t.collaborator_count}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={`flex-1 min-w-0 overflow-y-auto ${selectedId ? 'block' : 'hidden md:block'}`}>
            {selectedId ? (
              <TaskDetailClient
                key={selectedId}
                taskId={selectedId}
                onClose={closeTask}
                initialTitle={tasks.find((t) => t.id === selectedId)?.title}
                initialPriority={tasks.find((t) => t.id === selectedId)?.priority}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                Select a task to view details
              </div>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4">New Special Task</h2>
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}
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
              <button onClick={() => { setModal(false); setError(null) }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
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
