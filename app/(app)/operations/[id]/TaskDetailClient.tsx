'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { OpsTask, OpsReferenceLink, OpsCollaboratorUser, OpsActivityLogEntry, OpsUpdate, OpsComment } from '@/lib/supabase'

type Detail = {
  task: OpsTask
  reference_links: OpsReferenceLink[]
  collaborators: OpsCollaboratorUser[]
  activity_log: OpsActivityLogEntry[]
  isAdmin: boolean
  currentUserId: string
}

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

// Supports **bold** so activity text can highlight a heading or key phrase inline.
function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// Ctrl/Cmd+B wraps the selection in ** ** (or strips it if already bolded), mirroring the ** syntax renderFormattedText understands.
function handleBoldShortcut(e: React.KeyboardEvent<HTMLTextAreaElement>, value: string, setValue: (v: string) => void) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return
  e.preventDefault()
  const textarea = e.currentTarget
  const { selectionStart: start, selectionEnd: end } = textarea
  const selected = value.slice(start, end)

  let newValue: string
  let newStart: number
  let newEnd: number
  if (selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) {
    const unwrapped = selected.slice(2, -2)
    newValue = value.slice(0, start) + unwrapped + value.slice(end)
    newStart = start
    newEnd = start + unwrapped.length
  } else {
    newValue = value.slice(0, start) + '**' + selected + '**' + value.slice(end)
    newStart = start + 2
    newEnd = end + 2
  }

  setValue(newValue)
  requestAnimationFrame(() => {
    textarea.setSelectionRange(newStart, newEnd)
    textarea.focus()
  })
}

export default function TaskDetailClient({ taskId, onClose, initialTitle, initialPriority }: { taskId: string; onClose: () => void; initialTitle?: string; initialPriority?: 'low' | 'medium' | 'high' }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [allUsers, setAllUsers] = useState<OpsCollaboratorUser[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [updates, setUpdates] = useState<OpsUpdate[]>([])
  const [updateBody, setUpdateBody] = useState('')
  const [postingUpdate, setPostingUpdate] = useState(false)
  const [comments, setComments] = useState<OpsComment[]>([])
  const [mentionSuggestions, setMentionSuggestions] = useState<OpsCollaboratorUser[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null)
  const [editUpdateBody, setEditUpdateBody] = useState('')
  const [savingEditUpdate, setSavingEditUpdate] = useState(false)
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
    setCurrentUserId(data.currentUserId)
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

  const fetchComments = async () => {
    const res = await fetch(`/api/operations/${taskId}/comments`)
    if (!res.ok) return
    const data = await res.json()
    setComments(data.comments || [])
  }

  useEffect(() => {
    fetchDetail()
    fetchUpdates()
    fetchComments()
    fetch('/api/operations/users').then((r) => r.json()).then((d) => setAllUsers(d.users || []))

    const channel = supabase
      .channel(`ops-task-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_tasks', filter: `id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_activity_log', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_collaborators', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_reference_links', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_updates', filter: `task_id=eq.${taskId}` }, fetchUpdates)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_comments', filter: `task_id=eq.${taskId}` }, fetchComments)
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

  const handleUpdateBodyChange = (value: string) => {
    setUpdateBody(value)
    const lastAt = value.lastIndexOf('@')
    if (lastAt === -1) { setMentionSuggestions([]); return }
    const fragment = value.slice(lastAt + 1).toLowerCase()
    if (fragment.includes(' ')) { setMentionSuggestions([]); return }
    setMentionSuggestions(
      allUsers.filter((u) => (u.name || u.username).toLowerCase().startsWith(fragment)).slice(0, 5)
    )
  }

  const applyMentionSuggestion = (u: OpsCollaboratorUser) => {
    const lastAt = updateBody.lastIndexOf('@')
    const firstName = (u.name || u.username).split(' ')[0]
    setUpdateBody(updateBody.slice(0, lastAt) + '@' + firstName + ' ')
    setMentionSuggestions([])
  }

  const handlePostUpdate = async () => {
    setPostingUpdate(true)
    try {
      const res = await fetch(`/api/operations/${taskId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: updateBody, attachments: [] }),
      })
      if (res.ok) {
        setUpdateBody('')
        setMentionSuggestions([])
        fetchUpdates()
      }
    } finally {
      setPostingUpdate(false)
    }
  }

  const startEditUpdate = (id: string, body: string) => {
    setEditingUpdateId(id)
    setEditUpdateBody(body)
  }

  const handleSaveEditUpdate = async () => {
    if (!editingUpdateId) return
    setSavingEditUpdate(true)
    try {
      const res = await fetch(`/api/operations/${taskId}/updates`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingUpdateId, body: editUpdateBody }),
      })
      if (res.ok) {
        setEditingUpdateId(null)
        fetchUpdates()
      }
    } finally {
      setSavingEditUpdate(false)
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

  const confirmDelete = async () => {
    setDeleteConfirmOpen(false)
    setError(null)
    const res = await fetch(`/api/operations/${taskId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to delete task.')
      return
    }
    onClose()
  }

  const initials = (name: string) => (name || '?').trim().charAt(0).toUpperCase() || '?'

  if (!detail) {
    return (
      <div className="p-6 h-full overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">{initialTitle || ' '}</h1>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none px-1">×</button>
        </div>
        {initialPriority && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[initialPriority]}`}>
            {initialPriority.charAt(0).toUpperCase() + initialPriority.slice(1)}
          </span>
        )}
        <div className="mt-4 space-y-2 animate-pulse">
          <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-3 animate-pulse">
          <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-10 w-5/6 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
    )
  }

  const { task, reference_links, collaborators, activity_log } = detail

  const feed = [
    ...updates.map((u) => ({ id: u.id, body: u.body, attachments: u.attachments, created_at: u.created_at, author: u.author, kind: 'update' as const })),
    ...comments.map((c) => ({ id: c.id, body: c.body, attachments: c.attachments, created_at: c.created_at, author: c.author, kind: 'comment' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const latestUpdateId = updates.length > 0
    ? updates.reduce((latest, u) => (new Date(u.created_at) > new Date(latest.created_at) ? u : latest)).id
    : null

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">{task.title}</h1>
        <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none px-1">×</button>
      </div>

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
        <div>
          <div className="flex items-start justify-between">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[task.priority]}`}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>
            {isAdmin && (
              <div className="flex gap-2">
                <button onClick={() => setEditing(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                {task.is_special && (
                  <button onClick={handleArchiveToggle} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">
                    {task.is_archived ? 'Restore' : 'Archive'}
                  </button>
                )}
                {task.is_special && <button onClick={() => setDeleteConfirmOpen(true)} className="text-xs text-red-400 hover:text-red-600">Delete</button>}
              </div>
            )}
          </div>

          {task.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{task.description}</p>}

          {reference_links.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {reference_links.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  {l.label}
                </a>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
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

      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Activity</h2>

        <div className="space-y-4">
          {feed.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No activity yet.</p>}
          {feed.map((entry) => (
            <div key={entry.id} className="flex gap-3">
              <div className="w-7 h-7 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center">
                {initials(entry.author?.name || entry.author?.username || '?')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{entry.author?.name || entry.author?.username || 'Someone'}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  {entry.kind === 'update' && entry.id === latestUpdateId && entry.author?.id === currentUserId && editingUpdateId !== entry.id && (
                    <button onClick={() => startEditUpdate(entry.id, entry.body)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                  )}
                </div>
                {editingUpdateId === entry.id ? (
                  <div className="mt-1">
                    <textarea
                      value={editUpdateBody}
                      onChange={(e) => setEditUpdateBody(e.target.value)}
                      onKeyDown={(e) => handleBoldShortcut(e, editUpdateBody, setEditUpdateBody)}
                      rows={2}
                      className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm resize-none"
                    />
                    <div className="flex gap-2 mt-1">
                      <button onClick={handleSaveEditUpdate} disabled={savingEditUpdate || !editUpdateBody.trim()} className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                        {savingEditUpdate ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingUpdateId(null)} className="text-xs px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">{renderFormattedText(entry.body)}</p>
                )}
                {entry.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {entry.attachments.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        {a.label || a.url}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-4">
          <textarea
            value={updateBody}
            onChange={(e) => handleUpdateBodyChange(e.target.value)}
            onKeyDown={(e) => handleBoldShortcut(e, updateBody, setUpdateBody)}
            placeholder="Add a progress update... (use @Name to mention someone, Ctrl+B to bold)"
            rows={2}
            className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm resize-none"
          />
          {mentionSuggestions.length > 0 && (
            <div className="absolute z-10 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg mt-1 w-48">
              {mentionSuggestions.map((u) => (
                <button key={u.id} onClick={() => applyMentionSuggestion(u)} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">
                  {u.name || u.username}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={handlePostUpdate} disabled={postingUpdate || !updateBody.trim()} className="w-full mt-2 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:dark:bg-blue-900/40">
          {postingUpdate ? 'Saving...' : 'Save Update'}
        </button>
      </div>

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

      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirmOpen(false)}
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete this Special Task?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This can&apos;t be undone.</p>
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
    </div>
  )
}
