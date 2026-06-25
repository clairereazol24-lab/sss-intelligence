# Accounts Page Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email with a "Username" login identifier across login/Accounts, show the admin account in the Accounts list (read-only), and restructure the Accounts page into a 4-column table (Username | Name | Password | Access).

**Architecture:** A new `profiles.login_id` column holds the login identifier shown as "Username" in the UI; the existing `profiles.username` column is reused as-is for "Name" (no rename — it already only ever held a display name, never anything used for login). A synthetic email (`${slug}@lakiwin.internal`) is derived from `login_id` for Supabase Auth's internal email requirement. The one existing admin account (seeded before this feature, with a real email and no `login_id`) keeps working via a login-page fallback that retries with the raw typed value as a literal email if the synthetic-email attempt fails — no migration of the admin's account needed.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase Auth (admin API + `@supabase/ssr`), Tailwind CSS. No automated test suite — verification is `npx tsc --noEmit` + `npm run build` + manual curl/browser checks against the live Supabase project.

## Global Constraints

- `profiles.login_id`: new column, `VARCHAR(100) UNIQUE`, nullable (the existing seeded admin has none).
- `profiles.username` is NOT renamed at the database level — it continues to mean "display name" (UI label "Name"), exactly as it already behaved before this plan.
- Synthetic email format: `${slugifyLoginId(loginId)}@lakiwin.internal`, where `slugifyLoginId` lowercases and replaces any character outside `[a-z0-9._-]` with `-`. This function must be defined once in `lib/auth.ts` and imported everywhere it's needed (login page, both Accounts API routes) — never reimplemented inline, or a divergence would silently break logins.
- The email field disappears from every visible UI (login page, Accounts page) — "Username" (→ `login_id`) is the only identifier shown.
- No admin password is ever typed into chat, stored in a file, or passed through any API route — not relevant to this plan (it only touches member accounts and the existing admin's login flow, not their password).

---

### Task 1: Database schema — `profiles.login_id`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `profiles.login_id` column, read/written by Tasks 2-5.

- [ ] **Step 1: Append the column to the schema file**

Add this directly after the existing `profiles` table definition in `supabase/schema.sql` (find the block that starts `CREATE TABLE IF NOT EXISTS profiles (` and ends with `ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;` — add the new line immediately after that `ALTER TABLE` line):

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS login_id VARCHAR(100) UNIQUE;
```

- [ ] **Step 2: Tell the user to run this on the live database**

This step requires the user to run the SQL above in Supabase → SQL Editor (the app's anon key cannot run DDL). Do not proceed past this task until they confirm it's done. Verify it landed:

```bash
SUPA_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)
SUPA_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
curl -s "$SUPA_URL/rest/v1/profiles?select=login_id&limit=1" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"
```

Expected: a JSON array (e.g. `[{"login_id":null}]`), not a "could not find the column" error.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add profiles.login_id column for username-based login"
```

---

### Task 2: `lib/auth.ts` — slug and synthetic-email helpers

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Produces: `slugifyLoginId(loginId: string): string`, `syntheticEmailForLoginId(loginId: string): string`.
- Consumed by: Task 3 (login page), Task 4 (POST `/api/accounts`), Task 5 (PATCH `/api/accounts/:id`).

- [ ] **Step 1: Add the two functions**

Add this at the end of `lib/auth.ts` (after the existing `moduleForPath` function):

```ts
export function slugifyLoginId(loginId: string): string {
  return loginId.toLowerCase().replace(/[^a-z0-9._-]/g, '-')
}

export function syntheticEmailForLoginId(loginId: string): string {
  return `${slugifyLoginId(loginId)}@lakiwin.internal`
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "Add login-id slug and synthetic-email helpers"
```

---

### Task 3: Login page — Username field with legacy-email fallback

**Files:**
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: `syntheticEmailForLoginId` from `lib/auth.ts` (Task 2).

- [ ] **Step 1: Replace the component**

Replace the entire contents of `app/login/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { syntheticEmailForLoginId } from '@/lib/auth'

export default function LoginPage() {
  const [loginId, setLoginId] = useState('')
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
      const synthetic = syntheticEmailForLoginId(loginId)
      let { error: signInError } = await supabase.auth.signInWithPassword({ email: synthetic, password })
      if (signInError) {
        // Legacy fallback: the admin account was seeded before usernames existed and logs in
        // with a real email directly — retry treating the typed value as a literal email.
        const retry = await supabase.auth.signInWithPassword({ email: loginId, password })
        signInError = retry.error
      }
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-lg font-bold text-gray-800 mb-1">LakiWin</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in to Intelligence Engine</p>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-4 text-sm">{error}</div>}

        <label className="block text-xs text-gray-500 mb-1">Username</label>
        <input
          type="text"
          required
          autoComplete="username"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
        />

        <label className="block text-xs text-gray-500 mb-1">Password</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-6"
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

- [ ] **Step 2: Verify — build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 3: Verify — manual login check**

With the dev server running, confirm the existing admin account can still log in by typing their real email (`claire@racphil.com`) into the now-"Username"-labeled field — the synthetic-email attempt will fail first, then the fallback retry with the literal value should succeed. This is the only account that can exercise the fallback path right now (no `login_id`-based accounts exist until Task 4 ships).

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "Switch login page to Username with legacy-email fallback"
```

---

### Task 4: `POST /api/accounts` and `GET /api/accounts` — username-based creation, admin row included

**Files:**
- Modify: `app/api/accounts/route.ts`

**Interfaces:**
- Consumes: `syntheticEmailForLoginId` from `lib/auth.ts` (Task 2).
- Produces: `GET` now returns `{ accounts: { id, loginId, name, role, modules }[] }` for **every** profile (admin included) — `modules` is the literal string `'all'` for the admin row, otherwise the existing string array. `POST` body changes to `{ loginId, name, password, modules }` (was `{ email, username, password, modules }`).
- Consumed by: Task 6 (Accounts page UI).

- [ ] **Step 1: Replace the file**

```ts
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getUserAccess, syntheticEmailForLoginId } from '@/lib/auth'

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
      .select('id, username, login_id, role')
    if (profileError) throw profileError

    const { data: perms, error: permError } = await supabaseAdmin
      .from('module_permissions')
      .select('user_id, module')
    if (permError) throw permError

    const accounts = (profiles || []).map((p: any) => ({
      id: p.id,
      loginId: p.login_id || '',
      name: p.username,
      role: p.role,
      modules: p.role === 'admin' ? 'all' : (perms || []).filter((perm: any) => perm.user_id === p.id).map((perm: any) => perm.module),
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
    const { loginId, name, password, modules } = await request.json()

    if (!loginId || !name || !password) {
      return NextResponse.json({ error: 'Username, name, and password are required.' }, { status: 400 })
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmailForLoginId(loginId),
      password,
      email_confirm: true,
    })
    if (createError) {
      if (createError.message.toLowerCase().includes('already')) {
        return NextResponse.json({ error: 'Username already taken.' }, { status: 400 })
      }
      throw createError
    }

    const userId = created.user.id

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, username: name, login_id: loginId, role: 'member' })
    if (profileError) throw profileError

    if (modules && modules.length > 0) {
      const { error: permError } = await supabaseAdmin
        .from('module_permissions')
        .insert(modules.map((module: string) => ({ user_id: userId, module })))
      if (permError) throw permError
    }

    return NextResponse.json({ success: true, id: userId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify — build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 3: Verify — manual curl checks**

With the dev server running and logged in as admin in a browser (so there's a session cookie), or via the live E2E pattern (create a throwaway test account directly with the service role key, sign in, clean up):
- `GET /api/accounts` should now include a row for the admin profile with `role: 'admin'` and `modules: 'all'`.
- `POST /api/accounts` with a `loginId` that already exists (e.g. create the same username twice) should return `400 {"error":"Username already taken."}`, not a raw Supabase error string.

- [ ] **Step 4: Commit**

```bash
git add app/api/accounts/route.ts
git commit -m "Switch Accounts API to username-based creation, include admin in list"
```

---

### Task 5: `PATCH /api/accounts/:id` — editable name/loginId, keep auth email in sync

**Files:**
- Modify: `app/api/accounts/[id]/route.ts`

**Interfaces:**
- Consumes: `syntheticEmailForLoginId` from `lib/auth.ts` (Task 2).
- Produces: `PATCH` body becomes `{ name?, loginId?, modules?, password? }` (was `{ username?, modules?, password? }`). When `loginId` changes, the underlying Supabase Auth email is updated too — otherwise a changed `login_id` would stop matching the email computed at login time and the member would be locked out.

- [ ] **Step 1: Replace the file**

```ts
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getUserAccess, syntheticEmailForLoginId } from '@/lib/auth'

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
    const { name, loginId, modules, password } = await request.json()
    const userId = params.id

    const profileUpdate: Record<string, string> = {}
    if (name) profileUpdate.username = name
    if (loginId) profileUpdate.login_id = loginId
    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)
      if (profileError) throw profileError
    }

    if (loginId) {
      const { error: emailSyncError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: syntheticEmailForLoginId(loginId),
      })
      if (emailSyncError) throw emailSyncError
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

      if (modules.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('module_permissions')
          .insert(modules.map((module: string) => ({ user_id: userId, module })))
        if (insertError) throw insertError
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify — build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add "app/api/accounts/[id]/route.ts"
git commit -m "Sync auth email when a member's login_id changes"
```

---

### Task 6: Accounts page UI — table layout, admin row

**Files:**
- Modify: `app/(app)/accounts/page.tsx`

**Interfaces:**
- Consumes: `MODULES` from `lib/auth.ts`; `GET/POST /api/accounts`, `PATCH /api/accounts/:id` (Tasks 4-5).

- [ ] **Step 1: Replace the file**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { MODULES } from '@/lib/auth'

type Account = {
  id: string
  loginId: string
  name: string
  role: 'admin' | 'member'
  modules: string[] | 'all'
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newLoginId, setNewLoginId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newModules, setNewModules] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLoginId, setEditLoginId] = useState('')
  const [editName, setEditName] = useState('')
  const [editModules, setEditModules] = useState<string[]>([])
  const [editPassword, setEditPassword] = useState('')

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

  const handleAdd = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: newLoginId, name: newName, password: newPassword, modules: newModules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create account.')
      setNewLoginId(''); setNewName(''); setNewPassword(''); setNewModules([])
      fetchAccounts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (acct: Account) => {
    setEditingId(acct.id)
    setEditLoginId(acct.loginId)
    setEditName(acct.name)
    setEditModules(acct.modules === 'all' ? [] : acct.modules)
    setEditPassword('')
  }

  const handleEditSave = async () => {
    if (!editingId) return
    setSaving(true)
    setError('')
    try {
      const body: any = { name: editName, loginId: editLoginId, modules: editModules }
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Accounts</h1>
        <p className="text-sm text-gray-500">Manage logins and module access.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2 text-gray-500 font-medium w-[20%]">Username</th>
              <th className="px-3 py-2 text-gray-500 font-medium w-[20%]">Name</th>
              <th className="px-3 py-2 text-gray-500 font-medium w-[20%]">Password</th>
              <th className="px-3 py-2 text-gray-500 font-medium w-[30%]">Access</th>
              <th className="px-3 py-2 text-gray-500 font-medium w-[10%]"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : (
              <>
                {accounts.map((acct) => (
                  <tr key={acct.id} className="border-t border-gray-100">
                    {acct.role === 'admin' ? (
                      <>
                        <td className="px-3 py-3 text-gray-800">{acct.loginId || '—'}</td>
                        <td className="px-3 py-3 text-gray-800">{acct.name}</td>
                        <td className="px-3 py-3 text-gray-400">—</td>
                        <td className="px-3 py-3"><span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded">Admin · All modules</span></td>
                        <td className="px-3 py-3"></td>
                      </>
                    ) : editingId === acct.id ? (
                      <>
                        <td className="px-3 py-2"><input value={editLoginId} onChange={(e) => setEditLoginId(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full" /></td>
                        <td className="px-3 py-2"><input value={editName} onChange={(e) => setEditName(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full" /></td>
                        <td className="px-3 py-2"><input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} type="password" placeholder="New password (optional)" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full" /></td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {MODULES.map((m) => (
                              <label key={m.key} className="flex items-center gap-1 text-xs text-gray-600">
                                <input type="checkbox" checked={editModules.includes(m.key)} onChange={() => toggleModule(editModules, setEditModules, m.key)} />
                                {m.label}
                              </label>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={handleEditSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-2 py-1 rounded text-xs transition-colors">Save</button>
                            <button onClick={() => setEditingId(null)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-2 py-1 rounded text-xs transition-colors">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 text-gray-800">{acct.loginId}</td>
                        <td className="px-3 py-3 text-gray-800">{acct.name}</td>
                        <td className="px-3 py-3 text-gray-400">••••••••</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {acct.modules === 'all' || acct.modules.length === 0 ? (
                              <span className="text-xs text-gray-400">{acct.modules === 'all' ? 'All modules' : 'No modules granted'}</span>
                            ) : (
                              acct.modules.map((m) => (
                                <span key={m} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
                                  {MODULES.find((mod) => mod.key === m)?.label || m}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => startEdit(acct)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-2 py-1 rounded text-xs transition-colors">Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                <tr className="border-t border-gray-100 bg-gray-50/50">
                  <td className="px-3 py-2"><input placeholder="username" value={newLoginId} onChange={(e) => setNewLoginId(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full" /></td>
                  <td className="px-3 py-2"><input placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full" /></td>
                  <td className="px-3 py-2"><input placeholder="Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full" /></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {MODULES.map((m) => (
                        <label key={m.key} className="flex items-center gap-1 text-xs text-gray-600">
                          <input type="checkbox" checked={newModules.includes(m.key)} onChange={() => toggleModule(newModules, setNewModules, m.key)} />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={handleAdd} disabled={saving || !newLoginId || !newName || !newPassword} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-2 py-1 rounded text-xs transition-colors">
                      {saving ? '...' : '+ Add'}
                    </button>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify — build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 3: Manual browser check**

Logged in as admin: confirm the admin's own row shows with the "Admin · All modules" badge and no Edit button. Create a test member account inline (the bottom row), confirm it appears with the right loginId/name/modules. Edit it — change its loginId, confirm you can then log in as that member using the *new* loginId (proving the email-sync fix in Task 5 works) and the old one no longer works.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/accounts/page.tsx"
git commit -m "Rebuild Accounts page as a Username/Name/Password/Access table, include admin row"
```

---

## Self-Review Notes

- **Spec coverage:** A1 (username replaces email, synthetic email, login fallback) → Tasks 2-3; A2 (admin listed) → Task 4 (GET) + Task 6 (UI); A3 (table layout, 4 columns) → Task 6; login_id↔email sync on edit → Task 5 (the one risk the spec flagged as needing a plan-level decision, resolved here).
- **Placeholder scan:** none — every task has complete code.
- **Type consistency:** `Account` type in Task 6 matches the exact shape Task 4's `GET` produces (`id, loginId, name, role, modules`) — checked field-by-field, no drift.
