# Calendar Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone "Calendar" module to SSS Intelligence — a month-grid view of team events (title, optional time, details, attendees), ported from Kler-Management's Events tab.

**Architecture:** One new DB table (`calendar_events`, RLS-enabled from day one with an `authenticated` read policy), one new `ModuleKey` wired through the existing nav/permissions system, API routes under `app/api/calendar/` following the exact `requireOpsAccess`-style pattern already used by Operations, and a single client component (`CalendarClient.tsx`) rendering the grid + slide-in event panel with a Realtime subscription for live updates.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Auth + Realtime), TypeScript, Tailwind CSS.

## Global Constraints

- No test framework exists in this project (no vitest/jest, no `.test.ts` files) — verification is `npx tsc --noEmit` + `npm run build` + manual browser checks, matching how the existing Operations module was verified. Do not invent a test suite.
- No direct Postgres connection string is available (only `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`) — any `CREATE TABLE`/`ALTER TABLE` must be run manually by the user in the Supabase SQL Editor. Never attempt to script DDL via PostgREST.
- RLS: `calendar_events` gets `ENABLE ROW LEVEL SECURITY` + an `authenticated` SELECT policy from the start (per `feedback_rls_linter_gaps` memory) — the client subscribes to `postgres_changes` on this table, and a bare deny-all would silently break live updates.
- `attendees` stores plain display-name strings (`name || username`), not user IDs — matches Kler's live schema exactly (verified via OpenAPI schema pull), not a guess.
- Deploy: `git push origin main` auto-deploys to `sss-intelligence-iota.vercel.app` (Vercel). No manual deploy step needed beyond the push.
- Follow this codebase's existing conventions, not Kler's: plain `fetch()` (no `apiFetch` wrapper exists here), native `window.confirm()` for delete confirmation (no `ConfirmDialog` component exists here), `bg-blue-600` accent color (not Kler's teal), types centralized in `lib/supabase.ts` (not a separate types file).

---

### Task 1: Database migration (calendar_events table + RLS + module_permissions constraint)

**Files:**
- Modify: `supabase/schema.sql` (append new section at end of file)

**Interfaces:**
- Produces: `calendar_events` table with columns `id, date, title, time, details, attendees, created_by, created_at, is_deleted` — every later task's Supabase queries depend on this exact column set.
- Produces: `module_permissions.module` CHECK constraint now accepts `'calendar'` — Task 2's nav wiring and the `/accounts` permissions grid depend on this, otherwise granting a member Calendar access throws a DB constraint violation.

- [ ] **Step 1: Append the migration section to `supabase/schema.sql`**

Add this to the end of the file (after the existing `-- Seed the 4 permanent operational tasks...` block):

```sql

-- ============================================================
-- CALENDAR MODULE (general team events: meetings, deadlines, reminders)
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  time TEXT,
  details TEXT DEFAULT '',
  attendees TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);

-- Realtime (postgres_changes) enforces RLS — this policy must exist before the
-- client subscribes, or live updates silently stop delivering with no error.
-- All writes go through supabaseAdmin (service role) in the API routes, which
-- bypasses RLS regardless of this policy.
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON calendar_events FOR SELECT TO authenticated USING (true);

-- Allow the 'calendar' module in module_permissions
ALTER TABLE module_permissions DROP CONSTRAINT IF EXISTS module_permissions_module_check;
ALTER TABLE module_permissions ADD CONSTRAINT module_permissions_module_check
  CHECK (module IN ('dashboard', 'sss_data', 'members', 'performance', 'store_directory', 'ai_report', 'marketing_efforts', 'locked_retailers', 'operations', 'calendar'));
```

- [ ] **Step 2: Ask the user to run the migration**

Tell the user: "Please run the newly-appended section of `supabase/schema.sql` (the CALENDAR MODULE block) in the Supabase SQL Editor, then confirm once it's applied." Wait for their confirmation before proceeding to Step 3.

- [ ] **Step 3: Verify the migration applied correctly**

Write a throwaway verification script (per this project's established pattern — temp `.mjs` in project root, deleted after use):

```js
// verify-calendar-table.mjs
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await supabase.from('calendar_events').select('*').limit(1)
if (error) {
  console.error('FAIL:', error.message)
  process.exit(1)
}
console.log('PASS: calendar_events table is queryable. Row count sample:', data.length)

const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/openapi+json',
  },
})
const spec = await res.json()
const cols = Object.keys(spec.definitions.calendar_events.properties)
const expected = ['id', 'date', 'title', 'time', 'details', 'attendees', 'created_by', 'created_at', 'is_deleted']
const missing = expected.filter((c) => !cols.includes(c))
console.log(missing.length === 0 ? 'PASS: all expected columns present' : `FAIL: missing columns ${missing}`)
```

Run: `node --env-file=.env.local verify-calendar-table.mjs`
Expected: both lines print `PASS`.

Then delete the script: this is a throwaway verification file, not part of the codebase.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(calendar): add calendar_events table with RLS to schema.sql"
```

---

### Task 2: Register the Calendar module (nav + permissions)

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ModuleKey` now includes `'calendar'`; `MODULES` array includes the Calendar entry. Every later task's `hasModuleAccess(access, 'calendar')` call depends on this.

- [ ] **Step 1: Add the module key and nav entry**

In `lib/auth.ts`, change line 3:

```ts
export type ModuleKey = 'dashboard' | 'sss_data' | 'members' | 'performance' | 'store_directory' | 'locked_retailers' | 'operations' | 'ai_report' | 'marketing_efforts' | 'calendar'
```

Add a new entry to the `MODULES` array, right after the `operations` entry (before the commented-out `ai_report`/`marketing_efforts` lines):

```ts
  { key: 'operations', label: 'Operations', href: '/operations', icon: '📋' },
  { key: 'calendar', label: 'Calendar', href: '/calendar', icon: '📅' },
  // ai_report and marketing_efforts hidden — restore by uncommenting
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this change.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(calendar): register calendar ModuleKey and nav entry"
```

---

### Task 3: Access control helper

**Files:**
- Create: `lib/calendar-access.ts`

**Interfaces:**
- Consumes: `hasModuleAccess`, `UserAccess`, `ModuleKey` from `@/lib/auth` (existing).
- Produces: `requireCalendarAccess(): Promise<CalendarAccess | null>` and `type CalendarAccess = { userId: string; access: UserAccess }` — every API route in Task 6 calls `requireCalendarAccess()` first.

- [ ] **Step 1: Write the file**

```ts
import { headers } from 'next/headers'
import { hasModuleAccess, type ModuleKey, type UserAccess } from '@/lib/auth'

export type CalendarAccess = { userId: string; access: UserAccess }

// middleware.ts already ran auth.getUser() + getUserAccess() for this request and
// forwarded the result via headers — read that instead of repeating both round-trips.
// Note: unlike page routes, middleware.ts's moduleForPath() does NOT gate /api/calendar
// paths (it only matches page hrefs), so every API route must call this explicitly.
export async function requireCalendarAccess(): Promise<CalendarAccess | null> {
  const h = headers()
  const userId = h.get('x-user-id')
  const role = h.get('x-user-role') as UserAccess['role'] | null
  if (!userId || !role) return null

  const access: UserAccess = {
    role,
    username: h.get('x-user-username') || '',
    name: h.get('x-user-name') || null,
    allowedModules: (h.get('x-user-modules') || '').split(',').filter(Boolean) as ModuleKey[],
  }
  if (!hasModuleAccess(access, 'calendar')) return null
  return { userId, access }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/calendar-access.ts
git commit -m "feat(calendar): add requireCalendarAccess auth helper"
```

---

### Task 4: Shared type

**Files:**
- Modify: `lib/supabase.ts`

**Interfaces:**
- Produces: `export type CalendarEvent = { id, date, title, time, details, attendees, created_by, created_at }` — consumed by Tasks 5, 6, 7, 8.

- [ ] **Step 1: Add the type**

Append to `lib/supabase.ts` (after the `OpsNotification` type at the end of the file):

```ts

export type CalendarEvent = {
  id: string
  date: string
  title: string
  time: string | null
  details: string
  attendees: string[]
  created_by: string | null
  created_at: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase.ts
git commit -m "feat(calendar): add CalendarEvent type"
```

---

### Task 5: Server-side fetch helper

**Files:**
- Create: `lib/calendar-events.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/lib/supabase-admin`, `CalendarEvent` from `@/lib/supabase` (Task 4).
- Produces: `fetchCalendarEvents(year: number, month: number): Promise<CalendarEvent[]>` — consumed by Task 6's GET route and Task 7's server page component.

- [ ] **Step 1: Write the file**

```ts
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { CalendarEvent } from '@/lib/supabase'

export async function fetchCalendarEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const mm = String(month).padStart(2, '0')
  const startDate = `${year}-${mm}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .select('*')
    .eq('is_deleted', false)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
  if (error) throw new Error(error.message)

  return (data || []) as CalendarEvent[]
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/calendar-events.ts
git commit -m "feat(calendar): add fetchCalendarEvents helper"
```

---

### Task 6: API routes

**Files:**
- Create: `app/api/calendar/route.ts`
- Create: `app/api/calendar/users/route.ts`

**Interfaces:**
- Consumes: `requireCalendarAccess` (Task 3), `fetchCalendarEvents` (Task 5), `supabaseAdmin` (existing).
- Produces: `GET /api/calendar?year=&month=` → `{ events: CalendarEvent[], isAdmin: boolean, userId: string }`; `POST /api/calendar` → `{ event }`; `PATCH /api/calendar` → `{ event }`; `DELETE /api/calendar` → `{ success: true }`; `GET /api/calendar/users` → `{ users: { id, username, name }[] }`. Task 8's client component depends on these exact response shapes.

- [ ] **Step 1: Write `app/api/calendar/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireCalendarAccess } from '@/lib/calendar-access'
import { fetchCalendarEvents } from '@/lib/calendar-events'

export async function GET(request: NextRequest) {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  if (!year || !month) {
    return NextResponse.json({ error: 'year and month are required.' }, { status: 400 })
  }

  const events = await fetchCalendarEvents(year, month)
  return NextResponse.json({ events, isAdmin: auth.access.role === 'admin', userId: auth.userId })
}

export async function POST(request: NextRequest) {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  if (!body.date) return NextResponse.json({ error: 'Date is required.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .insert({
      title,
      date: body.date,
      time: body.time || null,
      details: body.details || '',
      attendees: Array.isArray(body.attendees) ? body.attendees : [],
      created_by: auth.userId,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ event: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('calendar_events').select('created_by').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  if (auth.access.role !== 'admin' && existing.created_by !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  if ('title' in body) updates.title = String(body.title).trim()
  if ('date' in body) updates.date = body.date
  if ('time' in body) updates.time = body.time || null
  if ('details' in body) updates.details = body.details || ''
  if ('attendees' in body) updates.attendees = Array.isArray(body.attendees) ? body.attendees : []

  const { data, error } = await supabaseAdmin.from('calendar_events').update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ event: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, permanent } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('calendar_events').select('created_by').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  if (permanent) {
    if (auth.access.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { error } = await supabaseAdmin.from('calendar_events').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    if (auth.access.role !== 'admin' && existing.created_by !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { error } = await supabaseAdmin.from('calendar_events').update({ is_deleted: true }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Write `app/api/calendar/users/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireCalendarAccess } from '@/lib/calendar-access'

export async function GET() {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin.from('profiles').select('id, username, name').order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ users: data || [] })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/calendar/route.ts app/api/calendar/users/route.ts
git commit -m "feat(calendar): add /api/calendar and /api/calendar/users routes"
```

---

### Task 7: Server page component

**Files:**
- Create: `app/(app)/calendar/page.tsx`

**Interfaces:**
- Consumes: `requireCalendarAccess` (Task 3), `fetchCalendarEvents` (Task 5), `CalendarClient` (Task 8 — this task is written first but references the not-yet-existing component; that's fine since Task 8 creates it next and TypeScript verification for this task happens after Task 8 is also in place. See Task 8 Step 3.)
- Produces: server-rendered initial props for `CalendarClient` — avoids the initial loading-spinner flash, matching Operations' `page.tsx` pattern.

- [ ] **Step 1: Write the file**

```tsx
import { requireCalendarAccess } from '@/lib/calendar-access'
import { fetchCalendarEvents } from '@/lib/calendar-events'
import CalendarClient from './CalendarClient'

export default async function Page() {
  const auth = await requireCalendarAccess()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const initialEvents = auth ? await fetchCalendarEvents(year, month) : []

  return (
    <CalendarClient
      initialEvents={initialEvents}
      initialYear={year}
      initialMonth={month}
      initialIsAdmin={auth?.access.role === 'admin'}
      initialUserId={auth?.userId}
    />
  )
}
```

- [ ] **Step 2: Commit (deferred)**

This file references `./CalendarClient`, which doesn't exist until Task 8. Do not run `tsc` or commit yet — commit this together with Task 8 in Task 8's Step 4.

---

### Task 8: Client component — month grid + event panel

**Files:**
- Create: `app/(app)/calendar/CalendarClient.tsx`

**Interfaces:**
- Consumes: `CalendarEvent` from `@/lib/supabase` (Task 4), `supabase` browser client from `@/lib/supabase` (existing), API routes from Task 6, props from Task 7's `page.tsx` (`initialEvents: CalendarEvent[]`, `initialYear: number`, `initialMonth: number`, `initialIsAdmin?: boolean`, `initialUserId?: string`).
- Produces: the `/calendar` page UI. Nothing else depends on this.

- [ ] **Step 1: Write the complete component**

```tsx
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
  const [pendingTodayOpen, setPendingTodayOpen] = useState(false)

  const fetchEvents = async (y: number, m: number) => {
    setLoading(true)
    const res = await fetch(`/api/calendar?year=${y}&month=${m}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setEvents(data.events || [])
    setIsAdmin(!!data.isAdmin)
    setUserId(data.userId || '')
    setLoading(false)
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

  function openToday() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    if (y !== year || m !== month) {
      // Switching months triggers a refetch (see the year/month effect below) — events
      // for the new month aren't in state yet, so defer opening the panel until that
      // refetch lands (pendingTodayOpen effect) instead of reading stale eventsByDate.
      setPendingTodayOpen(true)
      setYear(y)
      setMonth(m)
    } else {
      openDay(now.getDate())
    }
  }

  useEffect(() => {
    if (pendingTodayOpen && !loading) {
      setPendingTodayOpen(false)
      openDay(new Date().getDate())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTodayOpen, loading])

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

  async function handleDelete(permanent: boolean) {
    if (!editingId) return
    const message = permanent ? 'Permanently delete this event? This cannot be undone.' : 'Delete this event?'
    if (!confirm(message)) return
    setDeleting(true)
    const res = await fetch('/api/calendar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, permanent }),
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
                  <input type="text" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Event name…" className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Time <span className="normal-case font-normal">(optional)</span></label>
                  <input type="time" value={form.time} onChange={(e) => setField('time', e.target.value)} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Details</label>
                  <textarea value={form.details} onChange={(e) => setField('details', e.target.value)} rows={5} placeholder="What's this event about…" className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 outline-none resize-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Who&apos;s Present</label>
                  <div className="min-h-[40px] rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 px-3 py-2 flex flex-wrap gap-1.5 items-center">
                    {form.attendees.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5 text-[11px] font-medium">
                        {a}
                        <button onClick={() => toggleAttendee(a)} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 leading-none ml-0.5">×</button>
                      </span>
                    ))}
                    <select value="" onChange={(e) => { if (e.target.value) toggleAttendee(e.target.value) }} className="text-[11px] text-gray-500 dark:text-gray-400 bg-transparent outline-none cursor-pointer">
                      <option value="">+ Add person…</option>
                      {users
                        .filter((u) => !form.attendees.includes(u.name || u.username))
                        .sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username))
                        .map((u) => <option key={u.id} value={u.name || u.username}>{u.name || u.username}</option>)}
                    </select>
                  </div>
                </div>
                {formError && <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{formError}</p>}
              </div>

              <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                {panelMode === 'edit' && canEditCurrent && (
                  <>
                    <button onClick={() => handleDelete(false)} disabled={deleting || saving} className="px-3 py-2 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition disabled:opacity-50">
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                    {isAdmin && (
                      <button onClick={() => handleDelete(true)} disabled={deleting || saving} className="px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition disabled:opacity-50">
                        Permanently Delete
                      </button>
                    )}
                  </>
                )}
                <div className="flex-1" />
                <button onClick={backToList} disabled={saving || deleting} className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition disabled:opacity-50">Cancel</button>
                <button onClick={handleSave} disabled={saving || deleting} className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
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
```

- [ ] **Step 2: Verify TypeScript compiles (both Task 7 and Task 8 files)**

Run: `npx tsc --noEmit`
Expected: no errors. This is the first point where Task 7's `page.tsx` (which imports this file) can be type-checked.

- [ ] **Step 3: Verify the production build succeeds**

Run: `npm run build`
Expected: build completes successfully, `/calendar` appears in the route list.

- [ ] **Step 4: Commit both Task 7 and Task 8 files together**

```bash
git add "app/(app)/calendar/page.tsx" "app/(app)/calendar/CalendarClient.tsx"
git commit -m "feat(calendar): add Calendar module page (month grid + event panel)"
```

---

### Task 9: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Grant yourself Calendar access if not admin**

If your account is `admin` role, skip this — admins bypass module_permissions entirely. Otherwise go to `/accounts` and confirm "Calendar" now appears as a grantable module (proves Task 1's constraint fix + Task 2's nav registration both worked), and grant it to your account.

- [ ] **Step 3: Walk through the golden path in the browser**

1. Open `/calendar` — confirm "Calendar" appears in the sidebar nav and the page loads the current month with no console errors.
2. Click an empty day → confirm the panel opens directly into "New Event" (create mode), not a list.
3. Fill in Title = "Test Event", Time = `14:30`, Details = "Verification test", add yourself as an attendee → Create.
4. Confirm the day cell now shows the event title, and the panel returns to list mode showing the new event with time formatted as "2:30 PM".
5. Click the event → confirm edit mode shows all the saved fields correctly, including the time.
6. Edit the title, Save → confirm the change reflects immediately in both the panel and the grid cell (proves the Realtime subscription + refetch works).
7. Click Delete → confirm the browser's native confirm dialog appears, confirm it → event disappears from the grid.
8. If admin: create another event, then Permanently Delete it → confirm the confirm dialog appears and the event is gone. If not admin, confirm the "Permanently Delete" button is absent.
9. Open two browser tabs on `/calendar`, create an event in one → confirm it appears in the other within a couple seconds without a manual refresh (Realtime live-update check, same pattern used to verify Operations).

- [ ] **Step 4: Confirm ownership restriction**

Log in as a second, non-admin user (or ask the user to). Confirm that user can create their own events, but cannot edit or delete events created by the first user (the Edit/Delete buttons should be absent per the `canEditCurrent` check, and a direct PATCH/DELETE API call should return 403).

---

### Task 10: Deploy

**Files:** none

- [ ] **Step 1: Final build check**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 2: Push to deploy**

```bash
git push origin main
```

This auto-deploys to `sss-intelligence-iota.vercel.app` via Vercel's GitHub integration — no separate deploy command needed.

- [ ] **Step 3: Verify on the live site**

Open the live URL, confirm `/calendar` loads and repeat a quick version of Task 9 Step 3 (create one event, confirm it appears) against production data.
