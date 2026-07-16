# Operations Task Management Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Operations" module in SSS Intelligence — a flat list of persistent operational task workspaces (Ocular, Fully Deployed & New Store, Community Marketing, Booth Activation, plus manually-created Special Tasks), each with reference links, priority, collaborators, a separate Updates feed and Comments thread with @mentions, an auto-logged activity history, in-app notifications, and Telegram alerts.

**Architecture:** New Supabase tables (`ops_tasks`, `ops_reference_links`, `ops_collaborators`, `ops_updates`, `ops_comments`, `ops_activity_log`, `ops_notifications`) accessed exclusively through `supabaseAdmin` (this app's existing RLS-deny-all + admin-client pattern). A new `operations` module-permission key gates the module the same way every other module in `lib/auth.ts` already works. Six API route files under `app/api/operations/` serve the board, task detail, updates, comments, and notifications. Two client pages (board + task detail) subscribe to Supabase Realtime for live updates. A new `lib/telegram-ops.ts` sends immediate Telegram messages on mentions/updates/comments into a dedicated bot/chat, and a Vercel Cron route sends a daily deadline digest.

**Tech Stack:** Next.js 14 App Router, Supabase (`supabaseAdmin`, `@supabase/ssr` server client, Supabase Realtime), Tailwind — all existing project dependencies. No new npm packages.

## Global Constraints

- Attachments on Updates/Comments are **links only** — `{ label, url }` pairs rendered as clickable buttons. No file upload, no storage bucket (per spec).
- Any member with `operations` module access can post Updates/Comments on **any** task, not just tasks they're a listed Collaborator on — Collaborators is informational/mention-targeting only, not an access gate (per spec).
- Only **Special Tasks** (`is_special = true`) can be edited-to-archived or deleted; the 4 permanent tasks can never be archived or deleted (per spec).
- No Kanban status/columns — the board is a flat card list; the only lifecycle state is the Active/Archived toggle (per spec).
- Permissions reuse the existing `profiles.role` (`admin`/`member`) — no new role is introduced. Admin = the spec's "Department Head/Admin" tier (per spec).
- Telegram uses a **new, dedicated** bot/chat — never Kler-Management's bot/chat (per spec). One Telegram message is sent per event (mention/update/comment), not fanned out per recipient, since it posts into one shared group chat.
- Board card fields, exactly: Priority badge, **New Update** = count of this viewer's unread `type IN ('update','comment')` notifications for that task, **Comments** = total comment count (not unread), **Collaborators** = total collaborator count. This resolves an ambiguity in the original spec's card mockup.
- No automated test suite exists in this project — verification is manual, via `curl` for APIs and the browser for UI (per project convention, confirmed: no vitest/jest config present, same as `docs/superpowers/plans/2026-07-02-locked-retailers.md`).
- Always run `npm run build` before considering a task done (per project convention).
- This is a **live production system** (Supabase project already serving real users). All schema changes are additive (`CREATE TABLE IF NOT EXISTS`) and applied by hand through the Supabase SQL Editor, exactly matching this project's existing `SETUP.md` workflow — there is no migrations runner.

---

### Task 1: Database schema — Operations tables, permissions, realtime

**Files:**
- Modify: `supabase/schema.sql` — append the new tables/indexes/constraint update
- Create (temporary, deleted at the end of this task): `check-ops-schema.mjs` in the project root

**Interfaces:**
- Produces: 7 new tables (`ops_tasks`, `ops_reference_links`, `ops_collaborators`, `ops_updates`, `ops_comments`, `ops_activity_log`, `ops_notifications`) and an updated `module_permissions.module` CHECK constraint that allows `'operations'`. Every later task's API routes depend on these exact table/column names.

- [ ] **Step 1: Append the new schema to `supabase/schema.sql`**

Add this block at the end of `supabase/schema.sql`:

```sql

-- ============================================================
-- OPERATIONS MODULE (task workspaces: Ocular, Community Marketing, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS ops_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  deadline DATE,
  is_special BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_reference_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ops_collaborators (
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS ops_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('mention', 'update', 'comment', 'deadline')),
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ops_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_reference_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_collaborators DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_updates DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_activity_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_notifications DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ops_reference_links_task ON ops_reference_links(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_collaborators_user ON ops_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_ops_updates_task ON ops_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_comments_task ON ops_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_activity_log_task ON ops_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_notifications_user ON ops_notifications(user_id, is_read);

-- Allow the 'operations' module in module_permissions (was previously only
-- dashboard/sss_data/members/performance/store_directory/ai_report/marketing_efforts)
ALTER TABLE module_permissions DROP CONSTRAINT IF EXISTS module_permissions_module_check;
ALTER TABLE module_permissions ADD CONSTRAINT module_permissions_module_check
  CHECK (module IN ('dashboard', 'sss_data', 'members', 'performance', 'store_directory', 'ai_report', 'marketing_efforts', 'locked_retailers', 'operations'));

-- Seed the 4 permanent operational tasks (idempotent — skipped if already present).
-- Reference links are NOT seeded here — add the real SSS Checklist / Deployment
-- Tracker / etc. links through the app's "Manage Reference Links" UI after this
-- module ships, since no real URLs for those were available at migration time.
INSERT INTO ops_tasks (title, description, is_special)
SELECT 'Ocular', 'Monitor all ocular activities, store visits, and deployment updates.', false
WHERE NOT EXISTS (SELECT 1 FROM ops_tasks WHERE title = 'Ocular');

INSERT INTO ops_tasks (title, description, is_special)
SELECT 'Fully Deployed & New Store', 'Track newly deployed stores, DSP incentive monitoring, and deployment tracking.', false
WHERE NOT EXISTS (SELECT 1 FROM ops_tasks WHERE title = 'Fully Deployed & New Store');

INSERT INTO ops_tasks (title, description, is_special)
SELECT 'Community Marketing', 'Monitor all Community Marketing activities, reports, and player engagement updates.', false
WHERE NOT EXISTS (SELECT 1 FROM ops_tasks WHERE title = 'Community Marketing');

INSERT INTO ops_tasks (title, description, is_special)
SELECT 'Booth Activation', 'Track booth activation proposals, budgets, liquidation, and final reports.', false
WHERE NOT EXISTS (SELECT 1 FROM ops_tasks WHERE title = 'Booth Activation');
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Open the Supabase Dashboard for this project → **SQL Editor** → paste the entire block from Step 1 → **Run**. This matches the exact workflow already documented in `SETUP.md`. Expected: "Success. No rows returned" (the `INSERT ... WHERE NOT EXISTS` statements may report 1 row each, or 0 if already run before).

- [ ] **Step 3: Write a throwaway verification script**

Create `check-ops-schema.mjs` in the project root (per this project's established pattern for one-off live-DB checks — see `[[reference_sss_db_scripts]]`):

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data: tasks, error: tasksError } = await supabase
  .from('ops_tasks')
  .select('title, is_special, is_archived')
  .order('title')
if (tasksError) throw tasksError
console.log('ops_tasks:', tasks)

const { data: anyProfile, error: profileError } = await supabase
  .from('profiles')
  .select('id')
  .limit(1)
  .single()
if (profileError) throw profileError

// Functional check that the module_permissions CHECK constraint now accepts 'operations'
const { error: permError } = await supabase
  .from('module_permissions')
  .insert({ user_id: anyProfile.id, module: 'operations' })
if (permError) {
  console.error('module_permissions CHECK constraint did NOT accept "operations":', permError.message)
  process.exit(1)
}
await supabase.from('module_permissions').delete().eq('user_id', anyProfile.id).eq('module', 'operations')
console.log('module_permissions CHECK constraint OK, test row cleaned up.')
```

- [ ] **Step 4: Run the verification script**

Run from `C:\Users\RAC-CLAIRE\Desktop\sss-intelligence`: `node --env-file=.env.local check-ops-schema.mjs`
Expected: prints `ops_tasks:` with exactly 4 rows — `Booth Activation`, `Community Marketing`, `Fully Deployed & New Store`, `Ocular`, each `is_special: false, is_archived: false` — followed by `module_permissions CHECK constraint OK, test row cleaned up.`

- [ ] **Step 5: Delete the throwaway script and commit the schema change**

```bash
rm check-ops-schema.mjs
git add supabase/schema.sql
git commit -m "Add Operations module database schema (tasks, links, collaborators, updates, comments, activity log, notifications)"
```

---

### Task 2: Nav entry, shared types, and access-control helper

**Files:**
- Modify: `lib/auth.ts` — add `'operations'` to `ModuleKey` and a new `MODULES` entry
- Modify: `lib/supabase.ts` — add TypeScript types for the new tables
- Create: `lib/ops-access.ts`

**Interfaces:**
- Consumes: `getUserAccess`, `hasModuleAccess` from `lib/auth.ts` (existing); `supabaseAdmin` from `lib/supabase-admin.ts` (existing); server-side Supabase client from `lib/supabase-server.ts` (existing).
- Produces: `requireOpsAccess(): Promise<{ userId: string; access: UserAccess } | null>` and `requireOpsAdmin(): Promise<{ userId: string; access: UserAccess } | null>` — every API route in Tasks 3, 6, 7, 8 calls one of these first. `UserAccess`, `OpsTask`, `OpsReferenceLink`, `OpsCollaboratorUser`, `OpsUpdate`, `OpsComment`, `OpsActivityLogEntry`, `OpsNotification` types are consumed by every later frontend/backend task.

- [ ] **Step 1: Register the module in `lib/auth.ts`**

Change line 3 from:
```typescript
export type ModuleKey = 'dashboard' | 'sss_data' | 'members' | 'performance' | 'store_directory' | 'locked_retailers' | 'ai_report' | 'marketing_efforts'
```
to:
```typescript
export type ModuleKey = 'dashboard' | 'sss_data' | 'members' | 'performance' | 'store_directory' | 'locked_retailers' | 'operations' | 'ai_report' | 'marketing_efforts'
```

Add a new entry to the `MODULES` array (right after the `locked_retailers` entry):
```typescript
  { key: 'operations', label: 'Operations', href: '/operations', icon: '📋' },
```

- [ ] **Step 2: Add shared types to `lib/supabase.ts`**

Append to `lib/supabase.ts`:
```typescript
export type OpsTask = {
  id: string
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  deadline: string | null
  is_special: boolean
  is_archived: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type OpsReferenceLink = {
  id: string
  task_id: string
  label: string
  url: string
  sort_order: number
}

export type OpsCollaboratorUser = {
  id: string
  username: string
  name: string | null
}

export type OpsAttachment = { label: string; url: string }

export type OpsUpdate = {
  id: string
  task_id: string
  user_id: string
  body: string
  attachments: OpsAttachment[]
  created_at: string
  author: OpsCollaboratorUser | null
}

export type OpsComment = {
  id: string
  task_id: string
  user_id: string
  body: string
  attachments: OpsAttachment[]
  created_at: string
  author: OpsCollaboratorUser | null
}

export type OpsActivityLogEntry = {
  id: string
  task_id: string
  user_id: string
  action_text: string
  created_at: string
  author: OpsCollaboratorUser | null
}

export type OpsNotification = {
  id: string
  user_id: string
  task_id: string
  task_title: string
  type: 'mention' | 'update' | 'comment' | 'deadline'
  body: string
  is_read: boolean
  created_at: string
}
```

- [ ] **Step 3: Create the access-control helper**

Create `lib/ops-access.ts`:
```typescript
import { createClient as createServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getUserAccess, hasModuleAccess, type UserAccess } from '@/lib/auth'

export type OpsAccess = { userId: string; access: UserAccess }

export async function requireOpsAccess(): Promise<OpsAccess | null> {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const access = await getUserAccess(supabaseAdmin, user.id)
  if (!access || !hasModuleAccess(access, 'operations')) return null
  return { userId: user.id, access }
}

export async function requireOpsAdmin(): Promise<OpsAccess | null> {
  const result = await requireOpsAccess()
  if (!result || result.access.role !== 'admin') return null
  return result
}
```

- [ ] **Step 4: Run the build to confirm no type errors**

Run: `npm run build`
Expected: build succeeds (this task adds no new pages/routes yet, so this only checks the edited files compile).

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/supabase.ts lib/ops-access.ts
git commit -m "Add Operations nav entry, shared types, and access-control helper"
```

---

### Task 3: Tasks API — list, create, detail, edit, delete, and users lookup

**Files:**
- Create: `app/api/operations/route.ts`
- Create: `app/api/operations/[id]/route.ts`
- Create: `app/api/operations/users/route.ts`

**Interfaces:**
- Consumes: `requireOpsAccess`/`requireOpsAdmin` from `lib/ops-access.ts` (Task 2); `supabaseAdmin` from `lib/supabase-admin.ts`; `OpsTask`, `OpsReferenceLink`, `OpsCollaboratorUser`, `OpsActivityLogEntry` types from `lib/supabase.ts` (Task 2).
- Produces:
  - `GET /api/operations` → `{ tasks: (OpsTask & { collaborator_count: number; comment_count: number; unread_count: number })[]; isAdmin: boolean }` — `isAdmin` is this app's own role check, consumed directly by the frontend instead of inferring admin status from an unrelated route's response status.
  - `POST /api/operations` (admin only) → body `{ title: string; description: string; priority: 'low'|'medium'|'high'; deadline: string | null }`, returns `{ id: string }`
  - `GET /api/operations/[id]` → `{ task: OpsTask; reference_links: OpsReferenceLink[]; collaborators: OpsCollaboratorUser[]; activity_log: OpsActivityLogEntry[]; isAdmin: boolean }`
  - `PATCH /api/operations/[id]` (admin only) → body `{ title, description, priority, deadline, is_archived, reference_links: {label,url}[], collaborator_ids: string[] }`, returns `{ success: true }`
  - `DELETE /api/operations/[id]` (admin only, `is_special` tasks only) → returns `{ success: true }`
  - `GET /api/operations/users` → `{ users: OpsCollaboratorUser[] }` (all profiles, for the collaborator picker and @mention autocomplete used by Tasks 5, 6, 7)

- [ ] **Step 1: Create the list + create route**

Create `app/api/operations/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess, requireOpsAdmin } from '@/lib/ops-access'

export async function GET() {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: tasks, error } = await supabaseAdmin
    .from('ops_tasks')
    .select('*')
    .order('is_special', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const taskIds = (tasks || []).map((t: any) => t.id)

  const [{ data: collabRows }, { data: commentRows }, { data: notifRows }] = await Promise.all([
    supabaseAdmin.from('ops_collaborators').select('task_id').in('task_id', taskIds),
    supabaseAdmin.from('ops_comments').select('task_id').in('task_id', taskIds),
    supabaseAdmin
      .from('ops_notifications')
      .select('task_id')
      .in('task_id', taskIds)
      .eq('user_id', auth.userId)
      .eq('is_read', false)
      .in('type', ['update', 'comment']),
  ])

  const countBy = (rows: any[] | null) => {
    const map: Record<string, number> = {}
    for (const r of rows || []) map[r.task_id] = (map[r.task_id] || 0) + 1
    return map
  }
  const collabCounts = countBy(collabRows)
  const commentCounts = countBy(commentRows)
  const unreadCounts = countBy(notifRows)

  const result = (tasks || []).map((t: any) => ({
    ...t,
    collaborator_count: collabCounts[t.id] || 0,
    comment_count: commentCounts[t.id] || 0,
    unread_count: unreadCounts[t.id] || 0,
  }))

  return NextResponse.json({ tasks: result, isAdmin: auth.access.role === 'admin' })
}

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { title, description, priority, deadline } = await request.json()
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ops_tasks')
    .insert({
      title: String(title).trim(),
      description: description || null,
      priority: priority || 'medium',
      deadline: deadline || null,
      is_special: true,
      created_by: auth.userId,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('ops_activity_log').insert({
    task_id: data.id,
    user_id: auth.userId,
    action_text: 'created this task',
  })

  return NextResponse.json({ id: data.id })
}
```

- [ ] **Step 2: Create the users lookup route**

Create `app/api/operations/users/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess } from '@/lib/ops-access'

export async function GET() {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, name')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ users: data || [] })
}
```

- [ ] **Step 3: Create the detail/edit/delete route**

Create `app/api/operations/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess, requireOpsAdmin } from '@/lib/ops-access'

async function fetchUsersById(userIds: string[]) {
  if (userIds.length === 0) return {}
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, username, name')
    .in('id', Array.from(new Set(userIds)))
  const map: Record<string, { id: string; username: string; name: string | null }> = {}
  for (const u of data || []) map[u.id] = u
  return map
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: task, error: taskError }, { data: links }, { data: collabRows }, { data: activity }] =
    await Promise.all([
      supabaseAdmin.from('ops_tasks').select('*').eq('id', params.id).maybeSingle(),
      supabaseAdmin.from('ops_reference_links').select('*').eq('task_id', params.id).order('sort_order'),
      supabaseAdmin.from('ops_collaborators').select('user_id').eq('task_id', params.id),
      supabaseAdmin.from('ops_activity_log').select('*').eq('task_id', params.id).order('created_at', { ascending: false }),
    ])
  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 })
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })

  const userIds = [...(collabRows || []).map((c: any) => c.user_id), ...(activity || []).map((a: any) => a.user_id)]
  const usersById = await fetchUsersById(userIds)

  const collaborators = (collabRows || []).map((c: any) => usersById[c.user_id]).filter(Boolean)
  const activity_log = (activity || []).map((a: any) => ({ ...a, author: usersById[a.user_id] || null }))

  return NextResponse.json({ task, reference_links: links || [], collaborators, activity_log, isAdmin: auth.access.role === 'admin' })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('ops_tasks')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })

  const body = await request.json()
  const { title, description, priority, is_archived, reference_links, collaborator_ids } = body
  // Empty string means "cleared" in the edit form's date input — normalize to null
  // before it ever reaches the DATE column, otherwise Postgres rejects '' as an invalid date.
  const deadline = body.deadline === undefined ? undefined : (body.deadline || null)

  if (is_archived === true && !existing.is_special) {
    return NextResponse.json({ error: 'Only Special Tasks can be archived.' }, { status: 400 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('ops_tasks')
    .update({
      title: title ?? existing.title,
      description: description ?? existing.description,
      priority: priority ?? existing.priority,
      deadline: deadline === undefined ? existing.deadline : deadline,
      is_archived: is_archived === undefined ? existing.is_archived : is_archived,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const activityEntries: { task_id: string; user_id: string; action_text: string }[] = []
  if (priority !== undefined && priority !== existing.priority) {
    activityEntries.push({ task_id: params.id, user_id: auth.userId, action_text: `updated Priority to ${priority}` })
  }
  if (deadline !== undefined && deadline !== existing.deadline) {
    activityEntries.push({
      task_id: params.id,
      user_id: auth.userId,
      action_text: deadline ? `set Deadline to ${deadline}` : 'removed the Deadline',
    })
  }
  if (is_archived !== undefined && is_archived !== existing.is_archived) {
    activityEntries.push({
      task_id: params.id,
      user_id: auth.userId,
      action_text: is_archived ? 'archived this task' : 'restored this task from archive',
    })
  }

  if (Array.isArray(reference_links)) {
    await supabaseAdmin.from('ops_reference_links').delete().eq('task_id', params.id)
    if (reference_links.length > 0) {
      await supabaseAdmin.from('ops_reference_links').insert(
        reference_links.map((l: { label: string; url: string }, i: number) => ({
          task_id: params.id,
          label: l.label,
          url: l.url,
          sort_order: i,
        }))
      )
    }
    activityEntries.push({ task_id: params.id, user_id: auth.userId, action_text: 'updated Reference Links' })
  }

  if (Array.isArray(collaborator_ids)) {
    const { data: currentCollabs } = await supabaseAdmin
      .from('ops_collaborators')
      .select('user_id')
      .eq('task_id', params.id)
    const currentIds = new Set((currentCollabs || []).map((c: any) => c.user_id))
    const newIds = new Set(collaborator_ids as string[])
    const changed = currentIds.size !== newIds.size || [...currentIds].some((id) => !newIds.has(id))

    if (changed) {
      await supabaseAdmin.from('ops_collaborators').delete().eq('task_id', params.id)
      if (newIds.size > 0) {
        await supabaseAdmin
          .from('ops_collaborators')
          .insert([...newIds].map((user_id) => ({ task_id: params.id, user_id })))
      }
      activityEntries.push({ task_id: params.id, user_id: auth.userId, action_text: 'updated Collaborators' })
    }
  }

  if (activityEntries.length > 0) {
    await supabaseAdmin.from('ops_activity_log').insert(activityEntries)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: existing } = await supabaseAdmin.from('ops_tasks').select('is_special').eq('id', params.id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  if (!existing.is_special) {
    return NextResponse.json({ error: 'Permanent tasks cannot be deleted.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('ops_tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Start the dev server**

Run: `npm run dev`
Expected: `Ready in <N>s`, note the port.

- [ ] **Step 5: Verify with curl (replace `<port>`; you must be logged in via the browser first so `curl`'s cookies match — instead, verify the 403 paths, which don't need a session)**

```bash
curl -s http://localhost:<port>/api/operations
curl -s http://localhost:<port>/api/operations/users
```
Expected: both return `{"error":"Forbidden"}` (no session cookie sent) — confirms the auth gate is active.

- [ ] **Step 6: Verify the happy path in the browser**

1. Log in as an admin at `http://localhost:<port>`.
2. Open a new tab to `http://localhost:<port>/api/operations` — expect JSON with `"tasks"` containing the 4 seeded tasks (from Task 1), each with `collaborator_count: 0, comment_count: 0, unread_count: 0`.
3. Open `http://localhost:<port>/api/operations/users` — expect JSON with `"users"` listing existing profiles.
4. Copy one task `id` from step 2's response, open `http://localhost:<port>/api/operations/<id>` — expect `"task"`, `"reference_links": []`, `"collaborators": []`, `"activity_log": []`.

- [ ] **Step 7: Run the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/operations/route.ts app/api/operations/[id]/route.ts app/api/operations/users/route.ts
git commit -m "Add Operations tasks API: list, create, detail, edit, delete, users lookup"
```

---

### Task 4: Board page UI

**Files:**
- Create: `app/(app)/operations/page.tsx`
- Create: `app/(app)/operations/OperationsBoard.tsx`

**Interfaces:**
- Consumes: `GET /api/operations` and `POST /api/operations` from Task 3; `OpsTask` type from `lib/supabase.ts` (Task 2); `supabase` browser client from `lib/supabase.ts`.
- Produces: A page at `/operations` showing a card grid, live-updating via Supabase Realtime on `ops_tasks` changes; clicking a card navigates to `/operations/[id]` (built in Task 5).

- [ ] **Step 1: Enable Realtime for `ops_tasks`**

Open the Supabase Dashboard → **Database** → **Replication**, and add `ops_tasks` to the `supabase_realtime` publication (or run `ALTER PUBLICATION supabase_realtime ADD TABLE ops_tasks;` in the SQL Editor). Confirmed pattern: see `[[feedback_supabase_realtime]]`.

- [ ] **Step 2: Create the page shell**

Create `app/(app)/operations/page.tsx`:
```typescript
import OperationsBoard from './OperationsBoard'

export default function Page() {
  return <OperationsBoard />
}
```

- [ ] **Step 3: Create the board client component**

Create `app/(app)/operations/OperationsBoard.tsx`:
```typescript
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
```

- [ ] **Step 4: Restart the dev server and verify in the browser**

Run: `npm run dev`
1. Log in as an admin, confirm **Operations** (📋) appears in the sidebar.
2. Click it, confirm the 4 seeded cards render (Ocular, Fully Deployed & New Store, Community Marketing, Booth Activation), all Medium priority, all counts 0.
3. Click **+ New Special Task**, fill in a title, priority High, submit — confirm a 5th card appears immediately (Realtime) with a red High badge, without a manual page refresh.
4. Log in as a `member`-role account that has `operations` in `module_permissions` (create one via `/accounts` if needed) — confirm the **+ New Special Task** button is hidden.

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/operations/page.tsx" "app/(app)/operations/OperationsBoard.tsx"
git commit -m "Add Operations board page with realtime card grid"
```

---

### Task 5: Task detail page — metadata, reference links, collaborators, archive, activity history

**Files:**
- Create: `app/(app)/operations/[id]/page.tsx`
- Create: `app/(app)/operations/[id]/TaskDetailClient.tsx`

**Interfaces:**
- Consumes: `GET/PATCH/DELETE /api/operations/[id]` and `GET /api/operations/users` from Task 3; `OpsTask`, `OpsReferenceLink`, `OpsCollaboratorUser`, `OpsActivityLogEntry` types from `lib/supabase.ts`.
- Produces: A page at `/operations/[id]` rendering task metadata, an admin-only edit form, and the activity history accordion. Renders placeholder mount points `<div id="ops-updates-mount">` is NOT used — instead, Tasks 6 and 7 add their own sections directly inside this same client component (see Step 3's `{/* Updates and Comments sections added in Task 6/7 */}` marker).

- [ ] **Step 1: Create the page shell**

Create `app/(app)/operations/[id]/page.tsx`:
```typescript
import TaskDetailClient from './TaskDetailClient'

export default function Page({ params }: { params: { id: string } }) {
  return <TaskDetailClient taskId={params.id} />
}
```

- [ ] **Step 2: Create the detail client component**

Create `app/(app)/operations/[id]/TaskDetailClient.tsx`:
```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { OpsTask, OpsReferenceLink, OpsCollaboratorUser, OpsActivityLogEntry } from '@/lib/supabase'

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

  useEffect(() => {
    fetchDetail()
    fetch('/api/operations/users').then((r) => r.json()).then((d) => setAllUsers(d.users || []))

    const channel = supabase
      .channel(`ops-task-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_tasks', filter: `id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_activity_log', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_collaborators', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_reference_links', filter: `task_id=eq.${taskId}` }, fetchDetail)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/operations/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { setEditing(false); fetchDetail() }
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveToggle = async () => {
    if (!detail) return
    await fetch(`/api/operations/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: !detail.task.is_archived }),
    })
    fetchDetail()
  }

  const handleDelete = async () => {
    if (!confirm('Delete this Special Task? This cannot be undone.')) return
    const res = await fetch(`/api/operations/${taskId}`, { method: 'DELETE' })
    if (res.ok) router.push('/operations')
  }

  if (!detail) return <div className="p-6 text-gray-400 dark:text-gray-500 text-sm">Loading...</div>

  const { task, reference_links, collaborators, activity_log } = detail

  return (
    <div className="p-6 max-w-3xl">
      <button onClick={() => router.push('/operations')} className="text-xs text-gray-500 dark:text-gray-400 hover:underline mb-4">← Back to Operations</button>

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

      {/* Updates and Comments sections added in Task 6/7 */}

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
```

- [ ] **Step 3: Restart the dev server and verify in the browser**

Run: `npm run dev`
1. As admin, from the board click into **Community Marketing**, confirm the detail page loads with title/description/no links/no collaborators.
2. Click **Edit**, add a reference link (Label: `Test Link`, URL: `https://example.com`), check 1-2 collaborators, change Priority to High, Save. Confirm the view refreshes showing the 📄 Test Link button, the High badge, and the checked collaborators as chips.
3. Expand **Activity History**, confirm it shows `"... updated Priority to high"`, `"... updated Reference Links"`, `"... updated Collaborators"` entries with your name and a timestamp.
4. Click **Archive** — confirm it's disabled/absent for this permanent task (no Archive/Delete buttons should render since `task.is_special` is false for the 4 seeded tasks).
5. Go back to the board, open the Special Task created in Task 4's Step 4, confirm **Archive** and **Delete** buttons appear (since `is_special` is true), click Archive, confirm the task disappears from the default board view and reappears when "Show Archived" is checked.
6. Edit that Special Task again, set a Deadline, Save, confirm it now shows under the metadata view; edit again and clear the Deadline field entirely, Save — confirm this succeeds (no 500 error) and the Deadline line disappears from the metadata view, and the Activity History shows a "removed the Deadline" entry.
7. Log in as a non-admin member with `operations` access, open any task, confirm no **Edit/Archive/Delete** buttons render.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/operations/[id]/page.tsx" "app/(app)/operations/[id]/TaskDetailClient.tsx"
git commit -m "Add Operations task detail page: metadata edit, reference links, collaborators, archive, activity history"
```

---

### Task 6: Updates feed

**Files:**
- Create: `app/api/operations/[id]/updates/route.ts`
- Modify: `app/(app)/operations/[id]/TaskDetailClient.tsx`

**Interfaces:**
- Consumes: `requireOpsAccess` from `lib/ops-access.ts`; `OpsUpdate`, `OpsAttachment` types from `lib/supabase.ts`.
- Produces: `GET /api/operations/[id]/updates` → `{ updates: OpsUpdate[] }` (newest first); `POST /api/operations/[id]/updates` → body `{ body: string; attachments: OpsAttachment[] }`, returns `{ id: string }`. On create: inserts one `ops_notifications` row (type `update`) per collaborator excluding the author, and one row (type `mention`) per resolved `@Name` mention in the body. Task 9 (Telegram) later modifies this same route file to add a Telegram send after the insert.

- [ ] **Step 1: Create the updates API route**

Create `app/api/operations/[id]/updates/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess } from '@/lib/ops-access'

async function fetchUsersById(userIds: string[]) {
  if (userIds.length === 0) return {}
  const { data } = await supabaseAdmin.from('profiles').select('id, username, name').in('id', Array.from(new Set(userIds)))
  const map: Record<string, { id: string; username: string; name: string | null }> = {}
  for (const u of data || []) map[u.id] = u
  return map
}

async function notifyCollaboratorsAndMentions(taskId: string, authorId: string, body: string, type: 'update' | 'comment') {
  const { data: task } = await supabaseAdmin.from('ops_tasks').select('title').eq('id', taskId).maybeSingle()
  const taskTitle = task?.title || 'a task'

  const { data: collabRows } = await supabaseAdmin.from('ops_collaborators').select('user_id').eq('task_id', taskId)
  const collaboratorIds = (collabRows || []).map((c: any) => c.user_id).filter((id: string) => id !== authorId)

  const noun = type === 'update' ? 'a new Update' : 'a new Comment'
  if (collaboratorIds.length > 0) {
    await supabaseAdmin.from('ops_notifications').insert(
      collaboratorIds.map((user_id: string) => ({
        user_id,
        task_id: taskId,
        type,
        body: `${noun} was posted on "${taskTitle}".`,
      }))
    )
  }

  const mentionMatches = Array.from(new Set((body.match(/@[A-Z]\w*/g) || []).map((m) => m.slice(1).toLowerCase())))
  if (mentionMatches.length > 0) {
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id, username, name')
    const mentionedIds = (profiles || [])
      .filter((p: any) => {
        const first = (p.name || '').split(' ')[0].toLowerCase()
        return mentionMatches.includes(first) || mentionMatches.includes((p.username || '').toLowerCase())
      })
      .map((p: any) => p.id)
      .filter((id: string) => id !== authorId)

    if (mentionedIds.length > 0) {
      await supabaseAdmin.from('ops_notifications').insert(
        mentionedIds.map((user_id: string) => ({
          user_id,
          task_id: taskId,
          type: 'mention',
          body: `You were mentioned on "${taskTitle}".`,
        }))
      )
    }
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('ops_updates')
    .select('*')
    .eq('task_id', params.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const usersById = await fetchUsersById((data || []).map((u: any) => u.user_id))
  const updates = (data || []).map((u: any) => ({ ...u, author: usersById[u.user_id] || null }))

  return NextResponse.json({ updates })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { body, attachments } = await request.json()
  if (!body || !String(body).trim()) {
    return NextResponse.json({ error: 'Update body is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ops_updates')
    .insert({ task_id: params.id, user_id: auth.userId, body: String(body).trim(), attachments: attachments || [] })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyCollaboratorsAndMentions(params.id, auth.userId, String(body), 'update')

  return NextResponse.json({ id: data.id })
}
```

- [ ] **Step 2: Add the Updates section to `TaskDetailClient.tsx`**

In `app/(app)/operations/[id]/TaskDetailClient.tsx`, add imports and state. Change:
```typescript
import type { OpsTask, OpsReferenceLink, OpsCollaboratorUser, OpsActivityLogEntry } from '@/lib/supabase'
```
to:
```typescript
import type { OpsTask, OpsReferenceLink, OpsCollaboratorUser, OpsActivityLogEntry, OpsUpdate, OpsAttachment } from '@/lib/supabase'
```

Add state (near the other `useState` calls):
```typescript
  const [updates, setUpdates] = useState<OpsUpdate[]>([])
  const [updateBody, setUpdateBody] = useState('')
  const [updateAttachments, setUpdateAttachments] = useState<OpsAttachment[]>([])
  const [postingUpdate, setPostingUpdate] = useState(false)
```

Add a fetch function (near `fetchDetail`):
```typescript
  const fetchUpdates = async () => {
    const res = await fetch(`/api/operations/${taskId}/updates`)
    if (!res.ok) return
    const data = await res.json()
    setUpdates(data.updates || [])
  }
```

Call it alongside `fetchDetail()` in the main `useEffect` (add right after `fetchDetail()`):
```typescript
    fetchUpdates()
```

Add `ops_updates` to the realtime channel's subscriptions (insert this `.on(...)` call alongside the existing ones, before `.subscribe()`):
```typescript
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_updates', filter: `task_id=eq.${taskId}` }, fetchUpdates)
```

Add a submit handler (near `handleSave`):
```typescript
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
```

Replace the `{/* Updates and Comments sections added in Task 6/7 */}` marker with:
```typescript
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
```

- [ ] **Step 3: Restart the dev server and verify in the browser**

Run: `npm run dev`
1. Open a task detail page, confirm the **Updates** section renders with an empty textarea and "No updates yet."
2. Post an update with body `"5 stores visited today"` and one attachment (`Photos`, `https://drive.google.com/test`). Confirm it appears immediately above "No updates yet." with your name, timestamp, body text, and a 📎 Photos button linking to the URL.
3. Add a second collaborator account (or use the one already assigned in Task 5) and confirm posting an update as a different logged-in user still succeeds (any member can post to any task, per the spec decision).
4. In the Supabase Dashboard, check the `ops_notifications` table — confirm a row was inserted with `type = 'update'` for each collaborator on the task (excluding the poster).
5. Post an update containing `@<CollaboratorFirstName>` (matching an existing profile's first name), confirm an additional `ops_notifications` row with `type = 'mention'` was created for that user.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/operations/[id]/updates/route.ts "app/(app)/operations/[id]/TaskDetailClient.tsx"
git commit -m "Add Operations Updates feed with collaborator and mention notifications"
```

---

### Task 7: Comments thread with @mention autocomplete

**Files:**
- Create: `app/api/operations/[id]/comments/route.ts`
- Modify: `app/(app)/operations/[id]/TaskDetailClient.tsx`

**Interfaces:**
- Consumes: `requireOpsAccess` from `lib/ops-access.ts`; the same `notifyCollaboratorsAndMentions` logic pattern as Task 6 (duplicated in this route file, since it's a separate small helper scoped to its own route — matching this project's existing convention of not sharing tiny per-route helpers across files); `OpsComment` type from `lib/supabase.ts`; `allUsers` state already fetched in Task 5.
- Produces: `GET /api/operations/[id]/comments` → `{ comments: OpsComment[] }` (newest first); `POST /api/operations/[id]/comments` → body `{ body: string; attachments: OpsAttachment[] }`, returns `{ id: string }`, with the same collaborator/mention notification behavior as Updates. Task 9 (Telegram) later modifies this route file too.

- [ ] **Step 1: Create the comments API route**

Create `app/api/operations/[id]/comments/route.ts` (identical structure to Task 6's updates route, targeting `ops_comments` and `type: 'comment'`):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess } from '@/lib/ops-access'

async function fetchUsersById(userIds: string[]) {
  if (userIds.length === 0) return {}
  const { data } = await supabaseAdmin.from('profiles').select('id, username, name').in('id', Array.from(new Set(userIds)))
  const map: Record<string, { id: string; username: string; name: string | null }> = {}
  for (const u of data || []) map[u.id] = u
  return map
}

async function notifyCollaboratorsAndMentions(taskId: string, authorId: string, body: string) {
  const { data: task } = await supabaseAdmin.from('ops_tasks').select('title').eq('id', taskId).maybeSingle()
  const taskTitle = task?.title || 'a task'

  const { data: collabRows } = await supabaseAdmin.from('ops_collaborators').select('user_id').eq('task_id', taskId)
  const collaboratorIds = (collabRows || []).map((c: any) => c.user_id).filter((id: string) => id !== authorId)

  if (collaboratorIds.length > 0) {
    await supabaseAdmin.from('ops_notifications').insert(
      collaboratorIds.map((user_id: string) => ({
        user_id,
        task_id: taskId,
        type: 'comment',
        body: `A new Comment was posted on "${taskTitle}".`,
      }))
    )
  }

  const mentionMatches = Array.from(new Set((body.match(/@[A-Z]\w*/g) || []).map((m) => m.slice(1).toLowerCase())))
  if (mentionMatches.length > 0) {
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id, username, name')
    const mentionedIds = (profiles || [])
      .filter((p: any) => {
        const first = (p.name || '').split(' ')[0].toLowerCase()
        return mentionMatches.includes(first) || mentionMatches.includes((p.username || '').toLowerCase())
      })
      .map((p: any) => p.id)
      .filter((id: string) => id !== authorId)

    if (mentionedIds.length > 0) {
      await supabaseAdmin.from('ops_notifications').insert(
        mentionedIds.map((user_id: string) => ({
          user_id,
          task_id: taskId,
          type: 'mention',
          body: `You were mentioned on "${taskTitle}".`,
        }))
      )
    }
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('ops_comments')
    .select('*')
    .eq('task_id', params.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const usersById = await fetchUsersById((data || []).map((c: any) => c.user_id))
  const comments = (data || []).map((c: any) => ({ ...c, author: usersById[c.user_id] || null }))

  return NextResponse.json({ comments })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { body, attachments } = await request.json()
  if (!body || !String(body).trim()) {
    return NextResponse.json({ error: 'Comment body is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ops_comments')
    .insert({ task_id: params.id, user_id: auth.userId, body: String(body).trim(), attachments: attachments || [] })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyCollaboratorsAndMentions(params.id, auth.userId, String(body))

  return NextResponse.json({ id: data.id })
}
```

- [ ] **Step 2: Add the Comments section with @mention autocomplete to `TaskDetailClient.tsx`**

Change the type import line again:
```typescript
import type { OpsTask, OpsReferenceLink, OpsCollaboratorUser, OpsActivityLogEntry, OpsUpdate, OpsComment, OpsAttachment } from '@/lib/supabase'
```

Add state (near the Updates state added in Task 6):
```typescript
  const [comments, setComments] = useState<OpsComment[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [commentAttachments, setCommentAttachments] = useState<OpsAttachment[]>([])
  const [postingComment, setPostingComment] = useState(false)
  const [mentionSuggestions, setMentionSuggestions] = useState<OpsCollaboratorUser[]>([])
```

Add a fetch function (near `fetchUpdates`):
```typescript
  const fetchComments = async () => {
    const res = await fetch(`/api/operations/${taskId}/comments`)
    if (!res.ok) return
    const data = await res.json()
    setComments(data.comments || [])
  }
```

Call it in the main `useEffect`, right after `fetchUpdates()`:
```typescript
    fetchComments()
```

Add `ops_comments` to the realtime channel (another `.on(...)` before `.subscribe()`):
```typescript
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_comments', filter: `task_id=eq.${taskId}` }, fetchComments)
```

Add the mention-detection handler and submit handler (near `handlePostUpdate`):
```typescript
  const handleCommentBodyChange = (value: string) => {
    setCommentBody(value)
    const lastAt = value.lastIndexOf('@')
    if (lastAt === -1) { setMentionSuggestions([]); return }
    const fragment = value.slice(lastAt + 1).toLowerCase()
    if (fragment.includes(' ')) { setMentionSuggestions([]); return }
    setMentionSuggestions(
      allUsers.filter((u) => (u.name || u.username).toLowerCase().startsWith(fragment)).slice(0, 5)
    )
  }

  const applyMentionSuggestion = (u: OpsCollaboratorUser) => {
    const lastAt = commentBody.lastIndexOf('@')
    const firstName = (u.name || u.username).split(' ')[0]
    setCommentBody(commentBody.slice(0, lastAt) + '@' + firstName + ' ')
    setMentionSuggestions([])
  }

  const handlePostComment = async () => {
    setPostingComment(true)
    try {
      const res = await fetch(`/api/operations/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody, attachments: commentAttachments }),
      })
      if (res.ok) {
        setCommentBody('')
        setCommentAttachments([])
        setMentionSuggestions([])
        fetchComments()
      }
    } finally {
      setPostingComment(false)
    }
  }
```

Add the Comments section right after the Updates `</div>` closing tag added in Task 6 (still inside the component's returned JSX, before the Activity History `<div className="mt-6">`):
```typescript
      <div className="mt-6 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Comments</h2>

        <div className="relative">
          <textarea
            value={commentBody}
            onChange={(e) => handleCommentBodyChange(e.target.value)}
            placeholder="Discuss, clarify, or ask a question... (type @ to mention someone)"
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
        {commentAttachments.map((a, i) => (
          <div key={i} className="flex gap-2 mt-2">
            <input placeholder="Label" value={a.label} onChange={(e) => {
              const next = [...commentAttachments]; next[i] = { ...next[i], label: e.target.value }; setCommentAttachments(next)
            }} className="w-1/3 border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="URL" value={a.url} onChange={(e) => {
              const next = [...commentAttachments]; next[i] = { ...next[i], url: e.target.value }; setCommentAttachments(next)
            }} className="flex-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => setCommentAttachments(commentAttachments.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs px-2">Remove</button>
          </div>
        ))}
        <div className="flex items-center justify-between mt-2">
          <button onClick={() => setCommentAttachments([...commentAttachments, { label: '', url: '' }])} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">+ Add Attachment Link</button>
          <button onClick={handlePostComment} disabled={postingComment || !commentBody.trim()} className="px-4 py-1.5 text-sm bg-gray-700 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-500 disabled:bg-gray-300">
            {postingComment ? 'Posting...' : 'Post Comment'}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {comments.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{c.author?.name || c.author?.username || 'Someone'}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{c.body}</p>
              {c.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {c.attachments.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-full bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">
                      📎 {a.label || a.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
```

- [ ] **Step 3: Restart the dev server and verify in the browser**

Run: `npm run dev`
1. Open a task detail page, confirm the **Comments** section renders below Updates with a visually distinct (gray) background.
2. Type `@` followed by a known collaborator's first-name prefix, confirm a suggestion dropdown appears; click a suggestion, confirm it inserts `@FirstName ` into the textarea and closes the dropdown.
3. Post the comment, confirm it appears above "No comments yet." with your name/timestamp/body.
4. In the Supabase Dashboard, confirm an `ops_notifications` row with `type = 'mention'` was created for the mentioned user, and `type = 'comment'` rows for the task's other collaborators.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/operations/[id]/comments/route.ts "app/(app)/operations/[id]/TaskDetailClient.tsx"
git commit -m "Add Operations Comments thread with @mention autocomplete and notifications"
```

---

### Task 8: In-app notification bell

**Files:**
- Create: `app/api/operations/notifications/route.ts`
- Create: `app/(app)/operations/NotificationBell.tsx`
- Modify: `app/(app)/operations/OperationsBoard.tsx`

**Interfaces:**
- Consumes: `requireOpsAccess` from `lib/ops-access.ts`; `OpsNotification` type from `lib/supabase.ts`; `ops_notifications` rows created by Tasks 6 and 7.
- Produces: `GET /api/operations/notifications` → `{ notifications: OpsNotification[] }` (current user's, newest first, limited to 50); `PATCH /api/operations/notifications` → body `{ id: string } | { markAllRead: true }`, returns `{ success: true }`. `<NotificationBell />` renders inside the Operations board header.

- [ ] **Step 1: Create the notifications API route**

Create `app/api/operations/notifications/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess } from '@/lib/ops-access'

export async function GET() {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('ops_notifications')
    .select('*')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const taskIds = Array.from(new Set((data || []).map((n: any) => n.task_id)))
  const { data: tasks } = await supabaseAdmin.from('ops_tasks').select('id, title').in('id', taskIds)
  const titleById: Record<string, string> = {}
  for (const t of tasks || []) titleById[t.id] = t.title

  const notifications = (data || []).map((n: any) => ({ ...n, task_title: titleById[n.task_id] || 'Unknown task' }))

  return NextResponse.json({ notifications })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, markAllRead } = await request.json()

  if (markAllRead) {
    const { error } = await supabaseAdmin.from('ops_notifications').update({ is_read: true }).eq('user_id', auth.userId).eq('is_read', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (!id) return NextResponse.json({ error: 'id or markAllRead is required.' }, { status: 400 })

  const { error } = await supabaseAdmin.from('ops_notifications').update({ is_read: true }).eq('id', id).eq('user_id', auth.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Enable Realtime for `ops_notifications`**

In the Supabase SQL Editor: `ALTER PUBLICATION supabase_realtime ADD TABLE ops_notifications;`

- [ ] **Step 3: Create the notification bell component**

Create `app/(app)/operations/NotificationBell.tsx`:
```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { OpsNotification } from '@/lib/supabase'

export default function NotificationBell() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<OpsNotification[]>([])
  const [open, setOpen] = useState(false)

  const fetchNotifications = async () => {
    const res = await fetch('/api/operations/notifications')
    if (!res.ok) return
    const data = await res.json()
    setNotifications(data.notifications || [])
  }

  useEffect(() => {
    fetchNotifications()
    const channel = supabase
      .channel('ops-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_notifications' }, fetchNotifications)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const handleOpenNotification = async (n: OpsNotification) => {
    await fetch('/api/operations/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id }),
    })
    setOpen(false)
    router.push(`/operations/${n.task_id}`)
    fetchNotifications()
  }

  const handleMarkAllRead = async () => {
    await fetch('/api/operations/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
    fetchNotifications()
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative text-lg px-2 py-1">
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Notifications</span>
            {unreadCount > 0 && <button onClick={handleMarkAllRead} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Mark all read</button>}
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4 text-center">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <button key={n.id} onClick={() => handleOpenNotification(n)} className={`block w-full text-left px-3 py-2 text-xs border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${n.is_read ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200 font-medium'}`}>
                <div>{n.body}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{n.task_title} · {new Date(n.created_at).toLocaleString()}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Mount the bell in the board header**

In `app/(app)/operations/OperationsBoard.tsx`, add the import:
```typescript
import NotificationBell from './NotificationBell'
```

Change the header's button group:
```typescript
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
```
to:
```typescript
        <div className="flex items-center gap-3">
          <NotificationBell />
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
```

- [ ] **Step 5: Restart the dev server and verify in the browser**

Run: `npm run dev`
1. Open `/operations`, confirm the 🔔 bell renders in the header with no red badge (no notifications yet for this user).
2. From a different account, post an Update/Comment that mentions this user (or that targets a task this user collaborates on). Confirm the bell's red badge appears with the correct count, live, without a page refresh (Realtime).
3. Click the bell, confirm the dropdown lists the notification with task title and timestamp; click it, confirm it navigates to that task's detail page and the notification is marked read (badge count decrements).
4. Click **Mark all read** with multiple unread notifications present, confirm the badge disappears and all items render in the read (gray) style.

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/operations/notifications/route.ts "app/(app)/operations/NotificationBell.tsx" "app/(app)/operations/OperationsBoard.tsx"
git commit -m "Add Operations in-app notification bell"
```

---

### Task 9: Telegram integration

**Files:**
- Create: `lib/telegram-ops.ts`
- Modify: `app/api/operations/[id]/updates/route.ts`
- Modify: `app/api/operations/[id]/comments/route.ts`
- Modify: `.env.local` (not committed — see Step 3)

**Interfaces:**
- Produces: `sendOpsTelegramMessage(text: string): Promise<void>` — a fire-and-forget helper that never throws (Telegram failures must not break the update/comment request). Consumed by the two modified route files.

- [ ] **Step 1: Create the Telegram bot**

In Telegram, message **@BotFather** → `/newbot` → follow the prompts to name it (e.g. `SSS Operations Bot`) → copy the bot token it gives you. Then add the bot to your existing team group chat as a member.

- [ ] **Step 2: Get the group chat ID**

Send any message in the group chat mentioning the bot (or just send a message after adding it), then run (replace `<TOKEN>`):
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"
```
Expected: JSON containing a `"chat":{"id":<NEGATIVE_NUMBER>,...}` — group chat IDs are negative numbers. Copy that `id`.

- [ ] **Step 3: Add environment variables**

Add to `.env.local` (local dev) and to the Vercel project's Environment Variables (production) — replace with your actual values from Steps 1-2:
```
TELEGRAM_OPS_BOT_TOKEN=<your bot token>
TELEGRAM_OPS_CHAT_ID=<your group chat id, including the leading minus sign>
```

- [ ] **Step 4: Create the Telegram helper**

Create `lib/telegram-ops.ts`:
```typescript
export async function sendOpsTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_OPS_BOT_TOKEN
  const chatId = process.env.TELEGRAM_OPS_CHAT_ID
  if (!token || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch {
    // Telegram delivery failures must never fail the underlying request.
  }
}
```

- [ ] **Step 5: Wire it into the Updates route**

In `app/api/operations/[id]/updates/route.ts`, add the import:
```typescript
import { sendOpsTelegramMessage } from '@/lib/telegram-ops'
```

In `notifyCollaboratorsAndMentions`, after the mention-notifications insert block (right after the closing `}` of the `if (mentionedIds.length > 0) { ... }` block, still inside `if (mentionMatches.length > 0) { ... }`), add:
```typescript

    for (const id of mentionedIds) {
      const mentioned = (profiles || []).find((p: any) => p.id === id)
      await sendOpsTelegramMessage(`🔔 <b>${mentioned?.name || mentioned?.username}</b> was mentioned on "${taskTitle}"`)
    }
```

At the very end of `notifyCollaboratorsAndMentions` (after the mention block, before the function's closing `}`), add the general update notice:
```typescript

  await sendOpsTelegramMessage(`📋 New Update posted on "${taskTitle}"`)
```

- [ ] **Step 6: Wire it into the Comments route**

Apply the identical change from Step 5 to `app/api/operations/[id]/comments/route.ts`, using `💬 New Comment posted on "${taskTitle}"` as the general notice text instead of `📋 New Update posted...`.

- [ ] **Step 7: Verify in the browser and Telegram**

Run: `npm run dev`
1. Post an Update on any task from the browser. Confirm the group chat receives `"📋 New Update posted on \"<Task Title>\""` within a few seconds.
2. Post a Comment mentioning a real collaborator with `@FirstName`. Confirm the group chat receives both `"🔔 <Name> was mentioned on ..."` and `"💬 New Comment posted on ..."`.
3. Temporarily rename `TELEGRAM_OPS_BOT_TOKEN` to `TELEGRAM_OPS_BOT_TOKEN_X` in `.env.local`, restart the dev server, post another Update — confirm the API call still returns success (200) and the update still appears in the UI (Telegram silently no-ops when unconfigured). Revert the env var name afterward and restart again.

- [ ] **Step 8: Run the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add lib/telegram-ops.ts app/api/operations/[id]/updates/route.ts app/api/operations/[id]/comments/route.ts
git commit -m "Add Telegram alerts for Operations updates, comments, and mentions"
```

Note: `.env.local` is gitignored and intentionally not committed — confirm with `git status` that it doesn't appear before committing.

---

### Task 10: Daily deadline digest (Vercel Cron)

**Files:**
- Create: `app/api/cron/operations-deadlines/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `sendOpsTelegramMessage` from `lib/telegram-ops.ts` (Task 9); `supabaseAdmin` from `lib/supabase-admin.ts`.
- Produces: `GET /api/cron/operations-deadlines`, callable only with `Authorization: Bearer <CRON_SECRET>`, triggered daily by Vercel Cron at 9AM PHT (`0 1 * * *` UTC).

- [ ] **Step 1: Add a `CRON_SECRET` environment variable**

Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Add the output to `.env.local` and to the Vercel project's Environment Variables as `CRON_SECRET`.

- [ ] **Step 2: Create the cron route**

Create `app/api/cron/operations-deadlines/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendOpsTelegramMessage } from '@/lib/telegram-ops'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: tasks, error } = await supabaseAdmin
    .from('ops_tasks')
    .select('title, deadline')
    .eq('is_archived', false)
    .not('deadline', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const threeDaysOut = new Date(today)
  threeDaysOut.setDate(threeDaysOut.getDate() + 3)

  const overdue: string[] = []
  const upcoming: string[] = []

  for (const t of tasks || []) {
    const d = new Date(t.deadline + 'T00:00:00')
    if (d < today) overdue.push(`${t.title} (was due ${t.deadline})`)
    else if (d <= threeDaysOut) upcoming.push(`${t.title} (due ${t.deadline})`)
  }

  if (overdue.length === 0 && upcoming.length === 0) {
    return NextResponse.json({ sent: false, reason: 'No deadlines to report.' })
  }

  const lines = ['📅 <b>Operations Deadline Digest</b>']
  if (overdue.length > 0) lines.push('', '⚠️ Overdue:', ...overdue.map((l) => `• ${l}`))
  if (upcoming.length > 0) lines.push('', '🔜 Upcoming (next 3 days):', ...upcoming.map((l) => `• ${l}`))

  await sendOpsTelegramMessage(lines.join('\n'))

  return NextResponse.json({ sent: true, overdueCount: overdue.length, upcomingCount: upcoming.length })
}
```

- [ ] **Step 3: Create `vercel.json`**

Create `vercel.json` in the project root:
```json
{
  "crons": [
    { "path": "/api/cron/operations-deadlines", "schedule": "0 1 * * *" }
  ]
}
```

- [ ] **Step 4: Verify locally with curl**

Run: `npm run dev`, then (replace `<port>` and `<CRON_SECRET>` with the value from Step 1):
```bash
curl -s http://localhost:<port>/api/cron/operations-deadlines
curl -s http://localhost:<port>/api/cron/operations-deadlines -H "Authorization: Bearer <CRON_SECRET>"
```
Expected: the first call returns `{"error":"Unauthorized"}`; the second returns `{"sent":false,"reason":"No deadlines to report."}` if no seeded task currently has a near-term deadline, or `{"sent":true,...}` with a Telegram message received in the group chat if one of your test tasks (e.g. the Special Task from Task 4) has a deadline within the next 3 days or in the past — set one via the task's Edit form first if needed to test the positive path, then confirm the message and counts.

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/operations-deadlines/route.ts vercel.json
git commit -m "Add daily Telegram deadline digest for Operations via Vercel Cron"
```

- [ ] **Step 7: Deploy and confirm the cron registers**

After pushing to the branch Vercel deploys from, check the Vercel project's **Settings → Cron Jobs** tab and confirm `/api/cron/operations-deadlines` is listed with schedule `0 1 * * *`.
