# Accounts Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email-based account system with username-only logins (via synthetic `username@lakiwin.internal` emails), add a first-name field, show the admin row as read-only, and redesign the Accounts page as a 4-column table.

**Architecture:** The synthetic email (`username@lakiwin.internal`) is generated server-side on account creation and kept invisible to all UI. The login page translates the typed username to its synthetic email before calling Supabase. The Accounts page is a proper `<table>` with inline edit rows and an inline add row — no floating form panel.

**Tech Stack:** Next.js 14 App Router, Supabase (service role for admin routes), Tailwind CSS, TypeScript

## Global Constraints

- Synthetic email format: exactly `${username.trim().toLowerCase()}@lakiwin.internal` — no variation
- `profiles` table gains a `name TEXT` column (nullable) — added via a manual SQL migration before the code is deployed
- API response for accounts: `{ id, username, name, role, modules }` — no `email` field
- Admin rows in the Accounts table are read-only (no Edit button, Password and Access cells show `—`)
- No new npm dependencies
- TypeScript must compile cleanly: `npm run build` exits 0

---

### Task 1: DB Migration + API Routes

**Context:** This task updates both API route files and documents the required database migration. The login page (Task 2) and UI (Task 3) depend on the data shape established here.

**Files:**
- Modify: `app/api/accounts/route.ts`
- Modify: `app/api/accounts/[id]/route.ts`

**Interfaces:**
- Produces (for Task 3): `GET /api/accounts` returns `{ accounts: Array<{ id: string, username: string, name: string | null, role: 'admin' | 'member', modules: string[] }> }`
- Produces (for Task 2): `POST /api/accounts` accepts `{ username, name?, password, modules }` — no `email` field

- [ ] **Step 1: Run the DB migration in Supabase**

Open the Supabase dashboard → SQL Editor → run:

```sql
ALTER TABLE profiles ADD COLUMN name TEXT;
```

Verify: the `profiles` table now has a `name` column (nullable TEXT). Existing rows will have `name = NULL`.

- [ ] **Step 2: Read the current route files**

Read both files in full before making any changes:
- `app/api/accounts/route.ts`
- `app/api/accounts/[id]/route.ts`

- [ ] **Step 3: Replace `app/api/accounts/route.ts`**

Write the complete new file:

```ts
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getUserAccess } from '@/lib/auth'

export const runtime = 'nodejs'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const access = await getUserAccess(supabase, user.id)
  return access?.role === 'admin' ? user : null
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, name, role')
    if (profileError) throw profileError

    const { data: perms, error: permError } = await supabaseAdmin
      .from('module_permissions')
      .select('user_id, module')
    if (permError) throw permError

    const accounts = (profiles || []).map((p: any) => ({
      id: p.id,
      username: p.username,
      name: p.name ?? null,
      role: p.role as 'admin' | 'member',
      modules: (perms || [])
        .filter((perm: any) => perm.user_id === p.id)
        .map((perm: any) => perm.module as string),
    }))

    return NextResponse.json({ accounts })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { username, name, password, modules } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 })
    }

    const email = `${(username as string).trim().toLowerCase()}@lakiwin.internal`

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) throw createError

    const userId = created.user.id

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, username, name: name || null, role: 'member' })
    if (profileError) throw profileError

    if (modules && (modules as string[]).length > 0) {
      const { error: permError } = await supabaseAdmin
        .from('module_permissions')
        .insert((modules as string[]).map((module) => ({ user_id: userId, module })))
      if (permError) throw permError
    }

    return NextResponse.json({ success: true, id: userId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Replace `app/api/accounts/[id]/route.ts`**

Write the complete new file:

```ts
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getUserAccess } from '@/lib/auth'

export const runtime = 'nodejs'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const access = await getUserAccess(supabase, user.id)
  return access?.role === 'admin' ? user : null
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { username, name, modules, password } = await request.json()
    const userId = params.id

    const profileUpdate: { username?: string; name?: string | null } = {}
    if (username) profileUpdate.username = username
    if (name !== undefined) profileUpdate.name = name || null

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)
      if (profileError) throw profileError
    }

    if (username) {
      const newEmail = `${(username as string).trim().toLowerCase()}@lakiwin.internal`
      const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(userId, { email: newEmail })
      if (emailError) throw emailError
    }

    if (password) {
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
      if (pwError) throw pwError
    }

    if (modules) {
      const { error: deleteError } = await supabaseAdmin
        .from('module_permissions')
        .delete()
        .eq('user_id', userId)
      if (deleteError) throw deleteError

      if ((modules as string[]).length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('module_permissions')
          .insert((modules as string[]).map((module) => ({ user_id: userId, module })))
        if (insertError) throw insertError
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 5: Run TypeScript build**

Run: `npm run build`

Expected: exits 0, zero TypeScript errors. If it fails, read the error and fix it before continuing.

- [ ] **Step 6: Commit**

```bash
git add app/api/accounts/route.ts app/api/accounts/[id]/route.ts
git commit -m "feat: accounts API — synthetic email, name field, include admin in GET"
```

---

### Task 2: Login Page

**Context:** Fully independent of Tasks 1 and 3. Changes the login UI from email to username, translating to the synthetic email before calling Supabase.

**Files:**
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: nothing from other tasks — standalone change
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Read the current file**

Read `app/login/page.tsx` in full.

- [ ] **Step 2: Replace `app/login/page.tsx`**

Write the complete new file:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const email = username.trim().toLowerCase() + '@lakiwin.internal'
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      router.push('/')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">LakiWin</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Sign in to Intelligence Engine</p>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Username</label>
        <input
          type="text"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm mb-4"
        />

        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm mb-6"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript build**

Run: `npm run build`

Expected: exits 0, zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: login page — username field with synthetic email transform"
```

---

### Task 3: Accounts Page UI

**Context:** Depends on Task 1's API. The GET response now includes admin accounts, the `name` field, the `role` field, and no `email` field. This task is a full rewrite of the page as a 4-column table.

**Files:**
- Modify: `app/(app)/accounts/page.tsx`

**Interfaces:**
- Consumes from Task 1: `GET /api/accounts` → `{ accounts: Array<{ id: string, username: string, name: string | null, role: 'admin' | 'member', modules: string[] }> }`
- Consumes from Task 1: `POST /api/accounts` body: `{ username: string, name?: string, password: string, modules: string[] }`
- Consumes from Task 1: `PATCH /api/accounts/[id]` body: `{ username?: string, name?: string, password?: string, modules?: string[] }`

- [ ] **Step 1: Read the current file**

Read `app/(app)/accounts/page.tsx` in full.

- [ ] **Step 2: Replace `app/(app)/accounts/page.tsx`**

Write the complete new file:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { MODULES } from '@/lib/auth'

type Account = {
  id: string
  username: string
  name: string | null
  role: 'admin' | 'member'
  modules: string[]
}

const inputCls = 'border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm w-full'
const btnPrimary = 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors'
const btnSecondary = 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editModules, setEditModules] = useState<string[]>([])

  const [showAdd, setShowAdd] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addName, setAddName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addModules, setAddModules] = useState<string[]>([])

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load accounts.')
      setAccounts(data.accounts || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  const toggleModule = (list: string[], setList: (m: string[]) => void, key: string) => {
    setList(list.includes(key) ? list.filter((m) => m !== key) : [...list, key])
  }

  const startEdit = (acct: Account) => {
    setEditingId(acct.id)
    setEditUsername(acct.username)
    setEditName(acct.name ?? '')
    setEditPassword('')
    setEditModules(acct.modules)
    setShowAdd(false)
  }

  const handleEditSave = async () => {
    if (!editingId) return
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = { username: editUsername, name: editName, modules: editModules }
      if (editPassword) body.password = editPassword
      const res = await fetch(`/api/accounts/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update account.')
      setEditingId(null)
      fetchAccounts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: addUsername, name: addName, password: addPassword, modules: addModules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create account.')
      setShowAdd(false)
      setAddUsername(''); setAddName(''); setAddPassword(''); setAddModules([])
      fetchAccounts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelAdd = () => {
    setShowAdd(false)
    setAddUsername(''); setAddName(''); setAddPassword(''); setAddModules([])
  }

  const thCls = 'text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 text-sm'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Accounts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage member logins and module access.</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null) }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Add Account
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 p-5">Loading...</p>
        ) : accounts.length === 0 && !showAdd ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 p-5">No accounts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className={thCls}>Username</th>
                <th className={thCls}>Name</th>
                <th className={thCls}>Password</th>
                <th className={thCls}>Access</th>
                <th className="bg-gray-50 dark:bg-gray-700/50 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acct) => {
                if (acct.role === 'admin') {
                  return (
                    <tr key={acct.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">
                        {acct.username}
                        <span className="ml-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs px-1.5 py-0.5 rounded">Admin</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{acct.name ?? ''}</td>
                      <td className="px-4 py-3 text-gray-400 dark:text-gray-500">—</td>
                      <td className="px-4 py-3 text-gray-400 dark:text-gray-500">—</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  )
                }

                if (editingId === acct.id) {
                  return (
                    <tr key={acct.id} className="border-b border-gray-100 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-900/10">
                      <td className="px-4 py-3"><input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className={inputCls} /></td>
                      <td className="px-4 py-3"><input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} /></td>
                      <td className="px-4 py-3"><input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="New password (optional)" className={inputCls} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {MODULES.map((m) => (
                            <label key={m.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                              <input type="checkbox" checked={editModules.includes(m.key)} onChange={() => toggleModule(editModules, setEditModules, m.key)} />
                              {m.label}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={handleEditSave} disabled={saving} className={btnPrimary}>
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className={btnSecondary}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={acct.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{acct.username}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{acct.name ?? ''}</td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500">••••••••</td>
                    <td className="px-4 py-3">
                      {acct.modules.length === 0 ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500">No access</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {acct.modules.map((m) => (
                            <span key={m} className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs px-2 py-0.5 rounded">
                              {MODULES.find((mod) => mod.key === m)?.label ?? m}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => startEdit(acct)} className={btnSecondary}>Edit</button>
                    </td>
                  </tr>
                )
              })}

              {showAdd && (
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-green-50/30 dark:bg-green-900/10">
                  <td className="px-4 py-3"><input value={addUsername} onChange={(e) => setAddUsername(e.target.value)} placeholder="Username" className={inputCls} /></td>
                  <td className="px-4 py-3"><input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name" className={inputCls} /></td>
                  <td className="px-4 py-3"><input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="Password" className={inputCls} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {MODULES.map((m) => (
                        <label key={m.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                          <input type="checkbox" checked={addModules.includes(m.key)} onChange={() => toggleModule(addModules, setAddModules, m.key)} />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={handleAdd} disabled={saving} className={btnPrimary}>
                        {saving ? 'Creating...' : 'Create'}
                      </button>
                      <button onClick={cancelAdd} className={btnSecondary}>Cancel</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript build**

Run: `npm run build`

Expected: exits 0, zero TypeScript errors, all 19 pages compiled.

If it fails: read the TypeScript error. Most likely causes:
- `any` implicit in a map callback — fix by adding `: any` or the concrete type
- Missing key prop — all map calls in the component include `key`

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/accounts/page.tsx"
git commit -m "feat: accounts page — 4-column table, admin row, inline add/edit"
```
