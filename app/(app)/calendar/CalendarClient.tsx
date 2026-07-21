'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent } from '@/lib/supabase'

type PanelMode = 'closed' | 'list' | 'create' | 'edit'
type EventForm = { date: string; title: string; time: string; details: string; attendees: string[] }
type ProfileUser = { id: string; username: string; name: string | null }

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const BLANK_EVENT: EventForm = { date: '', title: '', time: '', details: '', attendees: [] }

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  return days
}

function padDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export default function CalendarClient({
  initialEvents,
  initialYear,
  initialMonth,
  initialIsAdmin,
  initialUserId,
}: {
  initialEvents: CalendarEvent[]
  initialYear: number
  initialMonth: number
  initialIsAdmin?: boolean
  initialUserId?: string
}) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(!!initialIsAdmin)
  const [userId, setUserId] = useState(initialUserId ?? '')
  const [users, setUsers] = useState<ProfileUser[]>([])

  const [panelMode, setPanelMode] = useState<PanelMode>('closed')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EventForm>(BLANK_EVENT)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchEvents = async (y: number, m: number): Promise<CalendarEvent[]> => {
    setLoading(true)
    const res = await fetch(`/api/calendar?year=${y}&month=${m}`)
    if (!res.ok) { setLoading(false); return [] }
    const data = await res.json()
    const freshEvents: CalendarEvent[] = data.events || []
    setEvents(freshEvents)
    setIsAdmin(!!data.isAdmin)
    setUserId(data.userId || '')
    setLoading(false)
    return freshEvents
  }

  useEffect(() => {
    fetch('/api/calendar/users').then((r) => r.json()).then((d) => setUsers(d.users || []))
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('calendar-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => fetchEvents(year, month))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  useEffect(() => {
    fetchEvents(year, month)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [events])

  const calendarDays = getCalendarDays(year, month)
  const todayStr = padDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())
  const currentDayEvents = eventsByDate.get(selectedDate ?? '') ?? []

  function goToMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setMonth(m)
    setYear(y)
  }

  function openDay(day: number) {
    const dateStr = padDate(year, month, day)
    const dayEvents = eventsByDate.get(dateStr) ?? []
    setSelectedDate(dateStr)
    setFormError(null)
    if (dayEvents.length === 0) {
      setForm({ ...BLANK_EVENT, date: dateStr })
      setEditingId(null)
      setPanelMode('create')
    } else {
      setPanelMode('list')
    }
  }

  function openFromList(ev: CalendarEvent) {
    setForm({ date: ev.date, title: ev.title, time: ev.time ?? '', details: ev.details ?? '', attendees: ev.attendees ?? [] })
    setEditingId(ev.id)
    setFormError(null)
    setPanelMode('edit')
  }

  function openNewForDate() {
    setForm({ ...BLANK_EVENT, date: selectedDate! })
    setEditingId(null)
    setFormError(null)
    setPanelMode('create')
  }

  async function openToday() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const d = now.getDate()
    if (y !== year || m !== month) {
      // Switching months — await the fresh fetch directly instead of relying on a
      // later effect/re-render to see updated state, which raced and opened a
      // blank panel using the previous month's stale eventsByDate.
      setYear(y)
      setMonth(m)
      const freshEvents = await fetchEvents(y, m)
      const dateStr = padDate(y, m, d)
      const dayEvents = freshEvents.filter((e) => e.date === dateStr)
      setSelectedDate(dateStr)
      setFormError(null)
      if (dayEvents.length === 0) {
        setForm({ ...BLANK_EVENT, date: dateStr })
        setEditingId(null)
        setPanelMode('create')
      } else {
        setPanelMode('list')
      }
    } else {
      openDay(d)
    }
  }

  function backToList() { setEditingId(null); setFormError(null); setPanelMode('list') }
  function closePanel() { setPanelMode('closed'); setSelectedDate(null); setEditingId(null); setFormError(null) }

  function setField<K extends keyof EventForm>(key: K, val: EventForm[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function toggleAttendee(name: string) {
    setForm((f) => ({ ...f, attendees: f.attendees.includes(name) ? f.attendees.filter((a) => a !== name) : [...f.attendees, name] }))
  }

  async function handleSave() {
    if (!form.title.trim()) { setFormError('Event title is required.'); return }
    setSaving(true)
    setFormError(null)
    const res = await fetch('/api/calendar', {
      method: panelMode === 'create' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(panelMode === 'create' ? form : { id: editingId, ...form }),
    })
    if (res.ok) {
      await fetchEvents(year, month)
      backToList()
    } else {
      const d = await res.json().catch(() => ({}))
      setFormError(d.error ?? 'Save failed.')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!editingId) return
    if (!confirm('Delete this event?')) return
    setDeleting(true)
    const res = await fetch('/api/calendar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId }),
    })
    if (res.ok) {
      await fetchEvents(year, month)
      backToList()
    } else {
      const d = await res.json().catch(() => ({}))
      setFormError(d.error ?? 'Delete failed.')
    }
    setDeleting(false)
  }

  const canEditCurrent = isAdmin || (editingId ? events.find((e) => e.id === editingId)?.created_by === userId : true)
  const canEditForm = panelMode === 'create' || canEditCurrent

  return (
    <div className="p-6 h-full flex flex-col md:flex-row gap-4">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Calendar</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Team events, meetings, and reminders</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => goToMonth(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Previous month">←</button>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 w-36 text-center">{MONTHS_FULL[month - 1]} {year}</span>
            <button onClick={() => goToMonth(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Next month">→</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          {DAYS_SHORT.map((d) => (
            <div key={d} className="bg-gray-50 dark:bg-gray-800 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">{d}</div>
          ))}
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={`blank-${i}`} className="bg-white dark:bg-gray-900 min-h-[90px]" />
            const dateStr = padDate(year, month, day)
            const dayEvents = eventsByDate.get(dateStr) ?? []
            const isToday = dateStr === todayStr
            const isSelected = panelMode !== 'closed' && selectedDate === dateStr
            return (
              <button
                key={dateStr}
                onClick={() => openDay(day)}
                className={`bg-white dark:bg-gray-900 min-h-[90px] p-1.5 text-left align-top hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors ${isSelected ? 'ring-2 ring-inset ring-blue-400' : ''}`}
              >
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${isToday ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300'}`}>{day}</span>
                {dayEvents.length === 1 && (
                  <p className="mt-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-tight line-clamp-2">{dayEvents[0].title}</p>
                )}
                {dayEvents.length > 1 && (
                  <div className="mt-1">
                    <div className="flex gap-0.5">
                      {dayEvents.slice(0, 5).map((_, idx) => <span key={idx} className="w-1.5 h-1.5 rounded-full bg-blue-500" />)}
                    </div>
                    <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5">{dayEvents.length} events</p>
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {loading && <p className="text-xs text-gray-400 mt-2">Refreshing…</p>}
      </div>

      {panelMode !== 'closed' && (
        <div className="w-full md:w-[360px] flex-shrink-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {panelMode !== 'list' && (
                <button onClick={backToList} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Back">←</button>
              )}
              <div className="min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium truncate">{fmtDate(selectedDate ?? '')}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                  {panelMode === 'list' ? `${currentDayEvents.length} event${currentDayEvents.length === 1 ? '' : 's'}` : panelMode === 'create' ? 'New Event' : 'Edit Event'}
                </p>
              </div>
            </div>
            <button onClick={closePanel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close">×</button>
          </div>

          {panelMode === 'list' && (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                {currentDayEvents.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No events scheduled for this date.</p>
                ) : currentDayEvents.map((ev) => (
                  <button key={ev.id} onClick={() => openFromList(ev)} className="w-full text-left bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition border border-transparent">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-500" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{ev.title}</p>
                      {ev.time && <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 ml-auto flex-shrink-0">{fmtTime(ev.time)}</span>}
                    </div>
                    {ev.details && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 ml-4 line-clamp-1">{ev.details}</p>}
                    {ev.attendees.length > 0 && <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mt-1 ml-4">{ev.attendees.length} present</p>}
                  </button>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                <button onClick={openNewForDate} className="w-full px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">+ New Event</button>
              </div>
            </>
          )}

          {panelMode !== 'list' && (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Event Title</label>
                  <input type="text" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Event name…" disabled={!canEditForm} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Time <span className="normal-case font-normal">(optional)</span></label>
                  <input type="time" value={form.time} onChange={(e) => setField('time', e.target.value)} disabled={!canEditForm} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Details</label>
                  <textarea value={form.details} onChange={(e) => setField('details', e.target.value)} rows={5} placeholder="What's this event about…" disabled={!canEditForm} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 outline-none resize-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Who&apos;s Present</label>
                  <div className="min-h-[40px] rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 px-3 py-2 flex flex-wrap gap-1.5 items-center">
                    {form.attendees.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5 text-[11px] font-medium">
                        {a}
                        {canEditForm && (
                          <button onClick={() => toggleAttendee(a)} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 leading-none ml-0.5">×</button>
                        )}
                      </span>
                    ))}
                    {canEditForm && (
                    <select value="" onChange={(e) => { if (e.target.value) toggleAttendee(e.target.value) }} className="text-[11px] text-gray-500 dark:text-gray-400 bg-transparent outline-none cursor-pointer">
                      <option value="">+ Add person…</option>
                      {users
                        .filter((u) => !form.attendees.includes(u.name || u.username))
                        .sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username))
                        .map((u) => <option key={u.id} value={u.name || u.username}>{u.name || u.username}</option>)}
                    </select>
                    )}
                  </div>
                </div>
                {formError && <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{formError}</p>}
              </div>

              <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                {panelMode === 'edit' && canEditCurrent && (
                  <button onClick={handleDelete} disabled={deleting || saving} className="px-3 py-2 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition disabled:opacity-50">
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                )}
                <div className="flex-1" />
                <button onClick={backToList} disabled={saving || deleting} className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition disabled:opacity-50">Cancel</button>
                <button onClick={handleSave} disabled={saving || deleting || !canEditForm} className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                  {saving ? 'Saving…' : panelMode === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Mobile FAB — quick-add an event for today */}
      <button
        onClick={openToday}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 text-white text-2xl leading-none shadow-lg hover:bg-blue-700 transition flex items-center justify-center z-40"
        aria-label="Add event for today"
      >
        +
      </button>
    </div>
  )
}
