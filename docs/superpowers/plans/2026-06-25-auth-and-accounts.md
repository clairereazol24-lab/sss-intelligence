# Auth & Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real authentication (login/logout, currently nonexistent — the app is fully open) plus an admin-only Accounts page where the admin creates member logins and picks which of the 5 modules each member can see.

**Architecture:** Supabase Auth (email/password) with `@supabase/ssr` for cookie-based sessions. A `profiles` table holds `role` (`admin`/`member`) + `username`; a `module_permissions` table holds per-member module grants. `middleware.ts` is the single enforcement point: it redirects unauthenticated requests to `/login`, blocks members from modules they aren't granted, and blocks everyone but the admin from `/accounts` and its API routes. Existing pages move into an `app/(app)/` route group so they share a layout that renders the Sidebar only when there's a logged-in user; `/login` lives outside that group with no Sidebar.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/supabase-js` + new `@supabase/ssr`), Tailwind CSS. No automated test suite in this repo — verification is `npx tsc --noEmit` + `npm run build`, plus manual browser/curl checks against the live Supabase project (anon key already in `.env.local` is sufficient for read checks; account-creation testing needs the service role key set up per the Prerequisites section).

## Global Constraints

- No public sign-up page anywhere — the only way to get a login is the admin creating it via `/accounts`, or the admin's own account seeded manually per Prerequisites.
- Exactly one role besides `member` exists: `admin`. No UI to promote a member to admin or create a second admin.
- RLS stays disabled on all tables (`profiles`, `module_permissions`, and the existing ones) — access control is enforced in the Next.js app (middleware + route handlers), not Postgres policies. This matches every existing table in `supabase/schema.sql`.
- The 5 modules and their canonical keys (used in `module_permissions.module` and throughout the code) are: `sss_data` → `/sss-data`, `performance` → `/performance`, `store_directory` → `/store-directory`, `ai_report` → `/ai-report`, `marketing_efforts` → `/marketing-efforts`.
- `SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `NEXT_PUBLIC_` and must only be read inside Route Handlers that declare `export const runtime = 'nodejs'` — never in client components, never in middleware (middleware uses the anon key + the user's own session cookie, same privilege level as the signed-in user).
- No admin password is ever typed into this chat, stored in a file, or passed through any API route written in this plan — the admin account is created directly in the Supabase dashboard by the user.

---

## Prerequisites (manual, before Task 1 is dispatched)

These must be done by the user — no subagent has access to the Supabase dashboard or Vercel project settings. **Do not start Task 1 until the user confirms both are done.**

1. **Create your own login.** Supabase dashboard → Authentication → Users → "Add user" → enter your email and a password (set directly there, not shared with anyone). Note the email you used.
2. **Run this SQL in Supabase → SQL Editor** (creates the two new tables, then seeds your account as admin — replace `YOUR_EMAIL_HERE` and `YOUR_NAME_HERE`):

```sql
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS module_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module VARCHAR(30) NOT NULL CHECK (module IN ('sss_data', 'performance', 'store_directory', 'ai_report', 'marketing_efforts')),
  PRIMARY KEY (user_id, module)
);
ALTER TABLE module_permissions DISABLE ROW LEVEL SECURITY;

INSERT INTO profiles (id, username, role)
SELECT id, 'YOUR_NAME_HERE', 'admin' FROM auth.users WHERE email = 'YOUR_EMAIL_HERE';
```

3. **Before Task 6 specifically** (not needed earlier): grab the service role key from Supabase → Project Settings → API → "service_role" secret, add it to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY=...` and to the Vercel project's Environment Variables (Production + Preview). The controller will remind you when Task 6 starts.

---

### Task 1: Database schema — `profiles` and `module_permissions`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: tables `profiles(id, username, role, created_at)` and `module_permissions(user_id, module)` — every later task reads/writes these.

- [ ] **Step 1: Append the schema**

Add this block to `supabase/schema.sql`, right before the `-- INDEXES` section:

```sql
-- ============================================================
-- PROFILES (role + display name for each Supabase Auth user)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- MODULE PERMISSIONS (per-member module grants; admins bypass this)
-- ============================================================
CREATE TABLE IF NOT EXISTS module_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module VARCHAR(30) NOT NULL CHECK (module IN ('sss_data', 'performance', 'store_directory', 'ai_report', 'marketing_efforts')),
  PRIMARY KEY (user_id, module)
);
ALTER TABLE module_permissions DISABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Verify**

Run `npm run build` — expect a clean build (this file isn't compiled, so this just confirms nothing else broke). The tables themselves were already created live by the user during Prerequisites, so confirm they're reachable:

```bash
SUPA_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)
SUPA_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
curl -s "$SUPA_URL/rest/v1/profiles?select=role" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"
```

Expected: a JSON array with one row, `{"role":"admin"}` (the seeded admin from Prerequisites).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add profiles and module_permissions tables for auth"
```

---

### Task 2: Supabase SSR clients and the `lib/auth.ts` access helper

**Files:**
- Create: `lib/supabase-server.ts`
- Create: `lib/supabase-browser.ts`
- Create: `lib/auth.ts`
- Modify: `package.json` (via `npm install`, not hand-edited)

**Interfaces:**
- Produces: `createClient()` (server, from `lib/supabase-server.ts`) and `createClient()` (browser, from `lib/supabase-browser.ts`) — both return a Supabase client typed the same as the existing `lib/supabase.ts` client.
- Produces (from `lib/auth.ts`): `type ModuleKey = 'sss_data' | 'performance' | 'store_directory' | 'ai_report' | 'marketing_efforts'`; `type ModuleDef = { key: ModuleKey; label: string; href: string; icon: string }`; `MODULES: ModuleDef[]`; `type UserAccess = { role: 'admin' | 'member'; username: string; allowedModules: ModuleKey[] }`; `getUserAccess(supabase: SupabaseClient, userId: string): Promise<UserAccess | null>`; `hasModuleAccess(access: UserAccess, module: ModuleKey): boolean`; `moduleForPath(pathname: string): ModuleKey | null`.
- Consumed by: Task 3 (layout), Task 4 (login), Task 5 (middleware, root page), Task 6 (API routes), Task 7 (Accounts page), Task 8 (Sidebar).

- [ ] **Step 1: Install `@supabase/ssr`**

```bash
npm install @supabase/ssr
```

- [ ] **Step 2: Create `lib/auth.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type ModuleKey = 'sss_data' | 'performance' | 'store_directory' | 'ai_report' | 'marketing_efforts'

export type ModuleDef = { key: ModuleKey; label: string; href: string; icon: string }

export const MODULES: ModuleDef[] = [
  { key: 'sss_data', label: 'SSS Data', href: '/sss-data', icon: '📤' },
  { key: 'performance', label: 'Performance', href: '/performance', icon: '🏆' },
  { key: 'store_directory', label: 'Store Directory', href: '/store-directory', icon: '🏪' },
  { key: 'ai_report', label: 'AI Report', href: '/ai-report', icon: '🤖' },
  { key: 'marketing_efforts', label: 'Marketing Efforts', href: '/marketing-efforts', icon: '📣' },
]

export type UserAccess = {
  role: 'admin' | 'member'
  username: string
  allowedModules: ModuleKey[]
}

export async function getUserAccess(supabase: SupabaseClient, userId: string): Promise<UserAccess | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  if (profile.role === 'admin') {
    return { role: 'admin', username: profile.username, allowedModules: MODULES.map((m) => m.key) }
  }

  const { data: perms } = await supabase
    .from('module_permissions')
    .select('module')
    .eq('user_id', userId)

  return {
    role: 'member',
    username: profile.username,
    allowedModules: (perms || []).map((p: any) => p.module as ModuleKey),
  }
}

export function hasModuleAccess(access: UserAccess, module: ModuleKey): boolean {
  return access.role === 'admin' || access.allowedModules.includes(module)
}

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))
  return match ? match.key : null
}
```

- [ ] **Step 3: Create `lib/supabase-server.ts`**

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Server Components can't set cookies — middleware refreshes the session instead.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Same as above.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 4: Create `lib/supabase-browser.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
```

Expected: zero errors (these files aren't imported anywhere yet, so this just confirms they're individually well-typed).

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts lib/supabase-server.ts lib/supabase-browser.ts package.json package-lock.json
git commit -m "Add Supabase SSR clients and module-access helper"
```

---

### Task 3: Move pages into an `app/(app)/` route group

**Files:**
- Move: `app/page.tsx` → `app/(app)/page.tsx`
- Move: `app/sss-data/page.tsx` → `app/(app)/sss-data/page.tsx`
- Move: `app/performance/page.tsx` → `app/(app)/performance/page.tsx`
- Move: `app/store-directory/page.tsx` → `app/(app)/store-directory/page.tsx`
- Move: `app/ai-report/page.tsx` → `app/(app)/ai-report/page.tsx`
- Move: `app/marketing-efforts/page.tsx` → `app/(app)/marketing-efforts/page.tsx`
- Create: `app/(app)/layout.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: none yet (this task is pure restructuring — it does not add auth checks or access filtering; that's Task 5 and Task 8).
- Produces: every existing route renders under `app/(app)/layout.tsx` instead of directly under the root layout. URL paths are unchanged (`(app)` is a route group and doesn't appear in the URL).

A route group in Next.js App Router is a folder wrapped in parentheses — it groups routes under a shared layout without adding a path segment. This is why `app/(app)/sss-data/page.tsx` is still served at `/sss-data`.

- [ ] **Step 1: Move the page files**

```bash
mkdir -p "app/(app)"
git mv app/page.tsx "app/(app)/page.tsx"
git mv app/sss-data "app/(app)/sss-data"
git mv app/performance "app/(app)/performance"
git mv app/store-directory "app/(app)/store-directory"
git mv app/ai-report "app/(app)/ai-report"
git mv app/marketing-efforts "app/(app)/marketing-efforts"
```

- [ ] **Step 2: Create `app/(app)/layout.tsx`**

This is where the Sidebar now renders (moved out of the root layout). It's a plain pass-through for now — no auth-fetching yet, that's added in Task 8 once the Sidebar needs real data. For now it must render Sidebar with the exact same static list it already had, so the app keeps working between this task and Task 8.

```tsx
import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Simplify the root `app/layout.tsx`**

Replace its contents with:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LakiWin Intelligence',
  description: 'Store Intelligence Engine',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean. Check the build's route list — it must show the exact same paths as before (`/`, `/sss-data`, `/performance`, `/store-directory`, `/ai-report`, `/marketing-efforts`), just now compiled from the new file locations.

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "Move pages into app/(app) route group ahead of auth layout"
```

---

### Task 4: Login page

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase-browser.ts` (Task 2).
- Produces: the `/login` route. Lives outside `app/(app)/`, so it renders under the plain root layout with no Sidebar.

- [ ] **Step 1: Create `app/login/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-lg font-bold text-gray-800 mb-1">LakiWin</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in to Intelligence Engine</p>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-4 text-sm">{error}</div>}

        <label className="block text-xs text-gray-500 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
        />

        <label className="block text-xs text-gray-500 mb-1">Password</label>
        <input
          type="password"
          required
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

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean, build output includes a new `/login` route.

- [ ] **Step 3: Commit**

```bash
git add app/login
git commit -m "Add login page"
```

---

### Task 5: Middleware — the actual auth and access gate

**Files:**
- Create: `middleware.ts` (project root, next to `package.json`)
- Modify: `app/(app)/page.tsx` (fix the hardcoded `/performance` redirect — see why below)

**Interfaces:**
- Consumes: `getUserAccess`, `hasModuleAccess`, `moduleForPath`, `MODULES` from `lib/auth.ts` (Task 2).
- Produces: every request except static assets passes through this gate before reaching a page or API route.

`app/(app)/page.tsx` currently does `redirect('/performance')` unconditionally. Once this middleware exists, a member without `performance` access would hit `/performance`, get redirected back to `/` by this middleware, which redirects to `/performance` again — an infinite loop. Fix it in the same task so the gate and the redirect target are never inconsistent.

- [ ] **Step 1: Create `middleware.ts`**

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getUserAccess, hasModuleAccess, moduleForPath } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (!user) {
    if (path === '/login') return response
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (path === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const access = await getUserAccess(supabase, user.id)
  if (!access) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const isAccountsRoute = path === '/accounts' || path.startsWith('/api/accounts')
  if (isAccountsRoute && access.role !== 'admin') {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  const moduleKey = moduleForPath(path)
  if (moduleKey && !hasModuleAccess(access, moduleKey)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: Fix `app/(app)/page.tsx`**

Replace its entire contents:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getUserAccess, MODULES } from '@/lib/auth'

export default async function Home() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const access = await getUserAccess(supabase, user.id)
  const firstAllowed = MODULES.find((m) => access && (access.role === 'admin' || access.allowedModules.includes(m.key)))

  if (firstAllowed) redirect(firstAllowed.href)

  return (
    <div className="p-6">
      <p className="text-sm text-gray-500">You don&apos;t have access to any modules yet. Contact your admin.</p>
    </div>
  )
}
```

- [ ] **Step 3: Verify — build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 4: Verify — manual browser check**

This is the first point where the whole login loop is real. Start the dev server (`npm run dev`) and check in a browser:
1. Visit any page (e.g. `/performance`) while logged out → redirected to `/login`.
2. Log in with the admin account from Prerequisites → redirected to `/` → redirected to `/performance` (the first module, since admin has access to all).
3. Visit `/login` again while logged in → redirected to `/`.
4. Visit `/accounts` while logged in as admin → loads (it'll 404 until Task 7 creates the page — that's expected; the point of this check is that middleware *let the request through* rather than redirecting away).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts "app/(app)/page.tsx"
git commit -m "Add auth/access middleware gate"
```

---

### Task 6: Accounts API routes

**Manual setup needed before this task:** confirm `SUPABASE_SERVICE_ROLE_KEY` is in `.env.local` and in Vercel's environment variables (see Prerequisites, item 3). Do not start this task until that's confirmed.

**Files:**
- Create: `app/api/accounts/route.ts`
- Create: `app/api/accounts/[id]/route.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase-server.ts` (for the defense-in-depth admin check) and `getUserAccess` from `lib/auth.ts` (Task 2).
- Produces: `GET /api/accounts` → `{ accounts: { id, username, email, modules }[] }`. `POST /api/accounts` body `{ email, password, username, modules: string[] }` → `{ success: true, id }`. `PATCH /api/accounts/:id` body `{ username?, modules?, password? }` → `{ success: true }`. Consumed by Task 7's Accounts page.

Middleware (Task 5) already blocks non-admins from `/api/accounts*`, but because this route can create logins and reset passwords, it also checks the caller's role itself rather than relying on middleware alone.

- [ ] **Step 1: Create `app/api/accounts/route.ts`**

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
      .select('id, username, role')
      .eq('role', 'member')
    if (profileError) throw profileError

    const { data: perms, error: permError } = await supabaseAdmin
      .from('module_permissions')
      .select('user_id, module')
    if (permError) throw permError

    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    if (usersError) throw usersError

    const accounts = (profiles || []).map((p: any) => ({
      id: p.id,
      username: p.username,
      email: usersData.users.find((u: any) => u.id === p.id)?.email || '',
      modules: (perms || []).filter((perm: any) => perm.user_id === p.id).map((perm: any) => perm.module),
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
    const { email, password, username, modules } = await request.json()

    if (!email || !password || !username) {
      return NextResponse.json({ error: 'Email, password, and username are required.' }, { status: 400 })
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) throw createError

    const userId = created.user.id

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, username, role: 'member' })
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

- [ ] **Step 2: Create `app/api/accounts/[id]/route.ts`**

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
    const { username, modules, password } = await request.json()
    const userId = params.id

    if (username) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ username })
        .eq('id', userId)
      if (profileError) throw profileError
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

- [ ] **Step 3: Verify — build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 4: Verify — manual curl check**

While logged in as admin in a browser (to have a valid session), or by temporarily testing with the dev server running, confirm `GET /api/accounts` returns `{"accounts":[]}` (no members created yet). Confirm hitting it while logged out (no cookie) returns `{"error":"Forbidden"}` with status 403:

```bash
curl -s -i http://localhost:3000/api/accounts | head -5
```

Expected: `HTTP/1.1 403` (no session cookie attached, since this is a bare curl with no browser cookie jar).

- [ ] **Step 5: Commit**

```bash
git add app/api/accounts
git commit -m "Add admin-only Accounts API routes"
```

---

### Task 7: Accounts page UI

**Files:**
- Create: `app/(app)/accounts/page.tsx`

**Interfaces:**
- Consumes: `MODULES` from `lib/auth.ts` (Task 2); `GET/POST /api/accounts` and `PATCH /api/accounts/:id` from Task 6.
- Produces: the `/accounts` route. Already gated to admin-only by middleware (Task 5).

- [ ] **Step 1: Create `app/(app)/accounts/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { MODULES } from '@/lib/auth'

type Account = {
  id: string
  username: string
  email: string
  modules: string[]
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState('')
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
        body: JSON.stringify({ email, password, username, modules: selectedModules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create account.')
      setShowAdd(false)
      setEmail(''); setPassword(''); setUsername(''); setSelectedModules([])
      fetchAccounts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (acct: Account) => {
    setEditingId(acct.id)
    setEditUsername(acct.username)
    setEditModules(acct.modules)
    setEditPassword('')
  }

  const handleEditSave = async () => {
    if (!editingId) return
    setSaving(true)
    setError('')
    try {
      const body: any = { username: editUsername, modules: editModules }
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Accounts</h1>
          <p className="text-sm text-gray-500">Manage member logins and module access.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Add Account
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">New Account</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            {MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={selectedModules.includes(m.key)}
                  onChange={() => toggleModule(selectedModules, setSelectedModules, m.key)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              {saving ? 'Creating...' : 'Create Account'}
            </button>
            <button onClick={() => setShowAdd(false)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-400">No member accounts yet.</p>
        ) : (
          <div className="space-y-3">
            {accounts.map((acct) => (
              <div key={acct.id} className="border border-gray-100 rounded-lg p-4">
                {editingId === acct.id ? (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Username" />
                      <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} type="password" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="New password (optional)" />
                    </div>
                    <div className="flex flex-wrap gap-3 mb-4">
                      {MODULES.map((m) => (
                        <label key={m.key} className="flex items-center gap-2 text-sm text-gray-600">
                          <input
                            type="checkbox"
                            checked={editModules.includes(m.key)}
                            onChange={() => toggleModule(editModules, setEditModules, m.key)}
                          />
                          {m.label}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleEditSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{acct.username}</p>
                      <p className="text-xs text-gray-400">{acct.email}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {acct.modules.length === 0 ? (
                          <span className="text-xs text-gray-400">No modules granted</span>
                        ) : (
                          acct.modules.map((m) => (
                            <span key={m} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
                              {MODULES.find((mod) => mod.key === m)?.label || m}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <button onClick={() => startEdit(acct)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean, build output includes `/accounts`.

- [ ] **Step 3: Manual browser check**

Logged in as admin: visit `/accounts`, create a test member account (any email/password/username, check one module box), confirm it appears in the list, edit it (change username, toggle a module, leave password blank), confirm the change persists on reload. Then log out, log in as that test member, confirm they land on the one module you granted and cannot reach `/accounts` (redirected to `/`) or any other module's URL (also redirected to `/`).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/accounts"
git commit -m "Add Accounts page UI"
```

---

### Task 8: Sidebar — filter nav by access, add Accounts link, add logout

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase-server.ts` and `lib/supabase-browser.ts`; `getUserAccess`, `MODULES`, `ModuleDef` from `lib/auth.ts` (Task 2).
- Produces: `Sidebar` now takes props `{ modules: ModuleDef[]; role: 'admin' | 'member'; username: string }` instead of hardcoding its nav list.

This task intentionally does **not** remove the "Relevant Tech · Alpharus" footer text or add a theme toggle / collapse button — those are sub-project 2 (sidebar redesign), scoped separately. It only adds what's needed to make today's login/logout/access-control loop usable: a way to reach `/accounts` as admin, a way to log out, and a nav list that actually reflects what the signed-in user can see.

- [ ] **Step 1: Rewrite `components/Sidebar.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { ModuleDef } from '@/lib/auth'

type SidebarProps = {
  modules: ModuleDef[]
  role: 'admin' | 'member'
  username: string
}

export default function Sidebar({ modules, role, username }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === href ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`

  return (
    <div className="w-60 bg-slate-900 text-white flex flex-col flex-shrink-0">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white tracking-wide">LakiWin</h1>
        <p className="text-xs text-slate-400 mt-0.5">Intelligence Engine</p>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {modules.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        {role === 'admin' && (
          <Link href="/accounts" className={linkClass('/accounts')}>
            <span className="text-base">⚙️</span>
            Accounts
          </Link>
        )}
      </nav>
      <div className="p-4 border-t border-slate-700 space-y-2">
        <p className="text-xs text-slate-500">Relevant Tech · Alpharus</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{username}</span>
          <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-white transition-colors">
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `app/(app)/layout.tsx` to fetch access and pass it down**

```tsx
import Sidebar from '@/components/Sidebar'
import { createClient } from '@/lib/supabase-server'
import { getUserAccess, MODULES } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = user ? await getUserAccess(supabase, user.id) : null

  const visibleModules = access
    ? MODULES.filter((m) => access.role === 'admin' || access.allowedModules.includes(m.key))
    : []

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar modules={visibleModules} role={access?.role ?? 'member'} username={access?.username ?? ''} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Verify — build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 4: Manual browser check**

Log in as admin: confirm the sidebar shows all 5 modules plus "Accounts", and your username appears in the footer. Click "Logout": confirm you land on `/login` and visiting any page afterward redirects back to `/login`. Log in as the test member created in Task 7 with only one module granted: confirm the sidebar shows only that one module (no "Accounts" link), and the username shown matches what you set for them.

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx "app/(app)/layout.tsx"
git commit -m "Filter sidebar by module access, add Accounts link and logout"
```

---

## Self-Review Notes

- **Spec coverage:** roles/data model → Task 1+2; auth mechanism/session → Task 2+4+5; module access enforcement (sidebar filtering + direct-URL guard + Accounts guard) → Task 5 (page+API guard) + Task 8 (sidebar filtering); Accounts page (list/add/edit) → Task 6+7; manual setup (service role key, admin seeding) → Prerequisites + reminder at Task 6.
- **Known, deliberate gap (flagged to user, not silently expanded):** the existing data API routes (`/api/upload`, `/api/performance`, `/api/stores`, `/api/stores/bulk`, `/api/marketing`, `/api/export`, `/api/ai-report`) are **not** gated by role/module in this plan — only `/accounts` and `/api/accounts*` are. The spec scoped enforcement to pages + sidebar; gating those shared data APIs risks breaking cross-module dependencies (e.g. `/api/performance` is used by both the Performance and SSS Data pages) and wasn't part of the approved design. A logged-in member with browser dev tools could still call those endpoints directly even for a module they're not granted. Acceptable for now (internal small-team tool, the goal is hiding UI from people who shouldn't casually see it, not defending against a malicious insider) — worth a follow-up spec later if that threat model changes.
- **Placeholder scan:** none found — every step has complete code.
- **Type consistency:** `ModuleKey`/`ModuleDef`/`UserAccess` defined once in Task 2's `lib/auth.ts` and imported everywhere else (Tasks 3, 5, 6, 7, 8) rather than redefined — checked for drift, none found.
