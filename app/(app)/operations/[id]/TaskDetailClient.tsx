'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { OpsTask, OpsReferenceLink, OpsCollaboratorUser, OpsActivityLogEntry, OpsUpdate, OpsAttachment } from '@/lib/supabase'

type Detail = {
  task: OpsTask
  reference_links: OpsReferenceLink[]
  collaborators: OpsCollaboratorUser[]
  activity_log: OpsActivityLogEntry[]
  isAdmin: boolean
}

export default function TaskDetailClient({ taskId }: { taskId: string }) {
  const router = useRouter()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [allUsers, setAllUsers] = useState<OpsCollaboratorUser[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updates, setUpdates] = useState<OpsUpdate[]>([])
  const [updateBody, setUpdateBody] = useState('')
  const [updateAttachments, setUpdateAttachments] = useState<OpsAttachment[]>([])
  const [postingUpdate, setPostingUpdate] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium' as 'low' | 'medium' | 'high', deadline: '',
    reference_links: [] as { label: string; url: string }[],
    collaborator_ids: [] as string[],
  })

  const fetchDetail = async () => {
    const res = await fetch(`/api/operations/${taskId}`)
    if (!res.ok) return
    const data: Detail = await res.json()
    setDetail(data)
    setIsAdmin(!!data.isAdmin)
    setForm({
      title: data.task.title,
      description: data.task.description || '',
      priority: data.task.priority,
      deadline: data.task.deadline || '',
      reference_links: data.reference_links.map((l) => ({ label: l.label, url: l.url })),
      collaborator_ids: data.collaborators.map((c) => c.id),
    })
  }

  const fetchUpdates = async () => {
    const res = await fetch(`/api/operations/${taskId}/updates`)
    if (!res.ok) return
    const data = await res.json()
    setUpdates(data.updates || [])
  }

  useEffect(() => {
    fetchDetail()
    fetchUpdates()
    fetch('/api/operations/users').then((r) => r.json()).then((d) => setAllUsers(d.users || []))

    const channel = supabase
      .channel(`ops-task-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_tasks', filter: `id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_activity_log', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_collaborators', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_reference_links', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_updates', filter: `task_id=eq.${taskId}` }, fetchUpdates)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/operations/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save task.')
        return
      }
      setEditing(false)
      fetchDetail()
    } finally {
      setSaving(false)
    }
  }

  const handlePostUpdate = async () => {
    setPostingUpdate(true)
    try {
      const res = await fetch(`/api/operations/${taskId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: updateBody, attachments: updateAttachments }),
      })
      if (res.ok) {
        setUpdateBody('')
        setUpdateAttachments([])
        fetchUpdates()
      }
    } finally {
      setPostingUpdate(false)
    }
  }

  const handleArchiveToggle = async () => {
    if (!detail) return
    setError(null)
    const res = await fetch(`/api/operations/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: !detail.task.is_archived }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to update archive status.')
      return
    }
    fetchDetail()
  }

  const handleDelete = async () => {
    if (!confirm('Delete this Special Task? This cannot be undone.')) return
    setError(null)
    const res = await fetch(`/api/operations/${taskId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to delete task.')
      return
    }
    router.push('/operations')
  }

  if (!detail) return <div className="p-6 text-gray-400 dark:text-gray-500 text-sm">Loading...</div>

  const { task, reference_links, collaborators, activity_log } = detail

  return (
    <div className="p-6 max-w-3xl">
      <button onClick={() => router.push('/operations')} className="text-xs text-gray-500 dark:text-gray-400 hover:underline mb-4">← Back to Operations</button>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {editing ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })} className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm">
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

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Reference Links</label>
            {form.reference_links.map((l, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input placeholder="Label" value={l.label} onChange={(e) => {
                  const next = [...form.reference_links]; next[i] = { ...next[i], label: e.target.value }; setForm({ ...form, reference_links: next })
                }} className="w-1/3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
                <input placeholder="URL" value={l.url} onChange={(e) => {
                  const next = [...form.reference_links]; next[i] = { ...next[i], url: e.target.value }; setForm({ ...form, reference_links: next })
                }} className="flex-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => setForm({ ...form, reference_links: form.reference_links.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600 text-xs px-2">Remove</button>
              </div>
            ))}
            <button onClick={() => setForm({ ...form, reference_links: [...form.reference_links, { label: '', url: '' }] })} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">+ Add Link</button>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Collaborators</label>
            <div className="flex flex-wrap gap-2">
              {allUsers.map((u) => {
                const checked = form.collaborator_ids.includes(u.id)
                return (
                  <label key={u.id} className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${checked ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                    <input type="checkbox" className="hidden" checked={checked} onChange={() => {
                      setForm({
                        ...form,
                        collaborator_ids: checked ? form.collaborator_ids.filter((id) => id !== u.id) : [...form.collaborator_ids, u.id],
                      })
                    }} />
                    {u.name || u.username}
                  </label>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setEditing(false); fetchDetail() }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-start justify-between">
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{task.title}</h1>
            {isAdmin && (
              <div className="flex gap-2">
                <button onClick={() => setEditing(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                {task.is_special && (
                  <button onClick={handleArchiveToggle} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">
                    {task.is_archived ? 'Restore' : 'Archive'}
                  </button>
                )}
                {task.is_special && <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600">Delete</button>}
              </div>
            )}
          </div>

          {task.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{task.description}</p>}

          {reference_links.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {reference_links.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">
                  📄 {l.label}
                </a>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
            <span>Priority: <strong className="text-gray-700 dark:text-gray-200">{task.priority}</strong></span>
            {task.deadline && <span>Deadline: <strong className="text-gray-700 dark:text-gray-200">{task.deadline}</strong></span>}
            {task.is_archived && <span className="text-gray-400">Archived</span>}
          </div>

          {collaborators.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {collaborators.map((c) => (
                <span key={c.id} className="text-xs px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  {c.name || c.username}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Updates</h2>

        <textarea
          value={updateBody}
          onChange={(e) => setUpdateBody(e.target.value)}
          placeholder="Post an operational update... (use @Name to mention someone)"
          rows={3}
          className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm resize-none"
        />
        {updateAttachments.map((a, i) => (
          <div key={i} className="flex gap-2 mt-2">
            <input placeholder="Label" value={a.label} onChange={(e) => {
              const next = [...updateAttachments]; next[i] = { ...next[i], label: e.target.value }; setUpdateAttachments(next)
            }} className="w-1/3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="URL" value={a.url} onChange={(e) => {
              const next = [...updateAttachments]; next[i] = { ...next[i], url: e.target.value }; setUpdateAttachments(next)
            }} className="flex-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => setUpdateAttachments(updateAttachments.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs px-2">Remove</button>
          </div>
        ))}
        <div className="flex items-center justify-between mt-2">
          <button onClick={() => setUpdateAttachments([...updateAttachments, { label: '', url: '' }])} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">+ Add Attachment Link</button>
          <button onClick={handlePostUpdate} disabled={postingUpdate || !updateBody.trim()} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
            {postingUpdate ? 'Posting...' : 'Post Update'}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {updates.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No updates yet.</p>}
          {updates.map((u) => (
            <div key={u.id} className="border-t border-gray-100 dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{u.author?.name || u.author?.username || 'Someone'}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(u.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{u.body}</p>
              {u.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {u.attachments.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">
                      📎 {a.label || a.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Comments section added in Task 7 */}

      <div className="mt-6">
        <button onClick={() => setShowActivity(!showActivity)} className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:underline">
          {showActivity ? '▼' : '▶'} Activity History ({activity_log.length})
        </button>
        {showActivity && (
          <div className="mt-2 space-y-1">
            {activity_log.map((a) => (
              <p key={a.id} className="text-xs text-gray-400 dark:text-gray-500">
                {a.author?.name || a.author?.username || 'Someone'} {a.action_text} — {new Date(a.created_at).toLocaleString()}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
