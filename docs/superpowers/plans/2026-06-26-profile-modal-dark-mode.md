# Profile Modal & Dark Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-service profile modal (change password, dark mode toggle, logout) to the sidebar footer and implement app-wide Tailwind dark mode persisted in localStorage with no light-flash on reload.

**Architecture:** `ThemeProvider` (client component, React context) holds theme state and exposes `useTheme()`; an inline `<script>` in root layout applies `class="dark"` before first paint; `ProfileModal` is a fixed panel rendered inside `Sidebar`; all page files get `dark:` class variants per the color map below.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS `darkMode: 'class'`, Supabase browser client (`@/lib/supabase-browser`), React context

## Global Constraints

- `darkMode: 'class'` in tailwind.config.js — required before any `dark:` variant works
- Theme key: `localStorage.getItem('theme')` → `'dark'` | `'light'`
- Password change: `supabase.auth.updateUser({ password })` — client-side only, no admin API
- No confirm-password field — single field per spec
- No `prefers-color-scheme` detection — user controls toggle manually
- Sidebar (`bg-slate-900`) is already dark — no dark variants needed there
- Color map (light → dark):
  - `bg-gray-50` (page bg) → `dark:bg-gray-900`
  - `bg-gray-50` (table header) → `dark:bg-gray-700`
  - `bg-white` → `dark:bg-gray-800`
  - `text-gray-800` → `dark:text-gray-100`
  - `text-gray-700` → `dark:text-gray-200`
  - `text-gray-600` → `dark:text-gray-300`
  - `text-gray-500` → `dark:text-gray-400`
  - `text-gray-400` → `dark:text-gray-500`
  - `border-gray-200` → `dark:border-gray-700`
  - `border-gray-100` → `dark:border-gray-700`
  - `border-gray-50` → `dark:border-gray-700`
  - `hover:bg-gray-50` → `dark:hover:bg-gray-700`
  - `hover:bg-gray-100` → `dark:hover:bg-gray-700`
  - inputs (`border-gray-200`) → add `dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100`
  - `bg-blue-50 text-blue-700` → add `dark:bg-blue-900/30 dark:text-blue-400`
  - `bg-red-50 border-red-200 text-red-700` → add `dark:bg-red-900/30 dark:border-red-800 dark:text-red-400`
  - `bg-green-50 border-green-200 text-green-800` → add `dark:bg-green-900/30 dark:border-green-800 dark:text-green-400`
  - `bg-yellow-50 border-yellow-200 text-yellow-800` → add `dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-400`
  - inactive mode buttons `bg-gray-100 text-gray-600` → add `dark:bg-gray-700 dark:text-gray-300`

---

### Task 1: Tailwind config + ThemeProvider + root layout

**Files:**
- Modify: `tailwind.config.js`
- Create: `components/ThemeProvider.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `useTheme(): { theme: 'light' | 'dark', setTheme: (t: 'light' | 'dark') => void }` — imported by ProfileModal

- [ ] **Step 1: Update tailwind.config.js**

Replace the entire file with:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 2: Create components/ThemeProvider.tsx**

```tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: 'light', setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored === 'dark') {
      setThemeState('dark')
      document.documentElement.classList.add('dark')
    }
  }, [])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('theme', t)
    if (t === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

- [ ] **Step 3: Update app/layout.tsx**

Replace entire file with:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ThemeProvider from '@/components/ThemeProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LakiWin Intelligence',
  description: 'Store Intelligence Engine',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npm run dev`
Open browser. Open DevTools → Application → Local Storage. Set `theme` = `dark`. Refresh. The `<html>` element should have `class="dark"` immediately (no flash). Remove the key, refresh — no `dark` class.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js components/ThemeProvider.tsx app/layout.tsx
git commit -m "feat: add ThemeProvider and anti-flash dark mode foundation"
```

---

### Task 2: ProfileModal component

**Files:**
- Create: `components/ProfileModal.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `@/components/ThemeProvider`
- Consumes: `createClient()` from `@/lib/supabase-browser`
- Produces: `<ProfileModal onClose={() => void} />` — used by Sidebar

- [ ] **Step 1: Create components/ProfileModal.tsx**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useTheme } from './ThemeProvider'

type Props = { onClose: () => void }

export default function ProfileModal({ onClose }: Props) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [password, setPassword] = useState('')
  const [pwStatus, setPwStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [updating, setUpdating] = useState(false)

  const handlePasswordUpdate = async () => {
    if (!password) return
    setUpdating(true)
    setPwStatus(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPwStatus({ ok: true, msg: 'Password updated.' })
      setPassword('')
    } catch (err: any) {
      setPwStatus({ ok: false, msg: err.message || 'Update failed.' })
    } finally {
      setUpdating(false)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed bottom-16 left-4 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{ width: 280 }}
      >
        {/* Change Password */}
        <div className="p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Change Password
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm mb-2 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <button
            onClick={handlePasswordUpdate}
            disabled={updating || !password}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {updating ? 'Updating…' : 'Update'}
          </button>
          {pwStatus && (
            <p className={`text-xs mt-2 ${pwStatus.ok ? 'text-green-600' : 'text-red-500'}`}>
              {pwStatus.msg}
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />

        {/* Theme toggle */}
        <div className="p-4 flex items-center justify-between">
          <span className="text-sm text-gray-700 dark:text-gray-200">Dark mode</span>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />

        {/* Logout */}
        <div className="p-4">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1.5 rounded-lg transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ProfileModal.tsx
git commit -m "feat: add ProfileModal with password change, theme toggle, logout"
```

---

### Task 3: Sidebar footer replacement

**Files:**
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `<ProfileModal onClose />` from `@/components/ProfileModal`

- [ ] **Step 1: Replace components/Sidebar.tsx**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ProfileModal from './ProfileModal'
import type { ModuleDef } from '@/lib/auth'

type SidebarProps = {
  modules: ModuleDef[]
  role: 'admin' | 'member'
  username: string
}

export default function Sidebar({ modules, role, username }: SidebarProps) {
  const pathname = usePathname()
  const [profileOpen, setProfileOpen] = useState(false)

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === href
        ? 'bg-blue-600 text-white'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="flex items-center gap-3 w-full hover:bg-slate-800 rounded-lg px-2 py-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">
              {(username[0] ?? '?').toUpperCase()}
            </span>
          </div>
          <span className="text-sm text-slate-300 truncate">{username}</span>
        </button>
        {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run `npm run dev`. Open any page. The sidebar bottom should show a circular avatar with the user's initial + username. Click it — modal appears with Change Password / Dark mode toggle / Log out. Click outside modal — it closes. Toggle dark mode — page background flips immediately. Toggle back — returns to light.

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: replace sidebar footer with profile avatar and modal"
```

---

### Task 4: Dark variants — login page + app shell

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/page.tsx`

- [ ] **Step 1: Update app/login/page.tsx**

Replace entire file with:

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">LakiWin</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Sign in to Intelligence Engine</p>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

- [ ] **Step 2: Update app/(app)/layout.tsx**

Replace entire file with:

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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <Sidebar modules={visibleModules} role={access?.role ?? 'member'} username={access?.username ?? ''} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Update app/(app)/page.tsx**

Replace entire file with:

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
      <p className="text-sm text-gray-500 dark:text-gray-400">You don&apos;t have access to any modules yet. Contact your admin.</p>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx "app/(app)/layout.tsx" "app/(app)/page.tsx"
git commit -m "feat: dark variants for login page and app shell"
```

---

### Task 5: Dark variants — Accounts page

**Files:**
- Modify: `app/(app)/accounts/page.tsx`

- [ ] **Step 1: Apply dark variants**

Make the following targeted replacements in `app/(app)/accounts/page.tsx`. Each line shows the old className value → new className value.

**Page heading:**
```
"text-2xl font-bold text-gray-800"
→
"text-2xl font-bold text-gray-800 dark:text-gray-100"

"text-sm text-gray-500"
→
"text-sm text-gray-500 dark:text-gray-400"
```

**Error banner:**
```
"bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm"
→
"bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm"
```

**Add account card (`showAdd` section):**
```
"bg-white rounded-xl border border-gray-200 p-5 mb-6"
→
"bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6"

"font-semibold text-gray-700 mb-3"
→
"font-semibold text-gray-700 dark:text-gray-200 mb-3"
```

**All text inputs** (3 in showAdd grid, 2 in editingId section):
```
"border border-gray-200 rounded-lg px-3 py-2 text-sm"
→
"border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm"
```

**Module checkboxes label text:**
```
"flex items-center gap-2 text-sm text-gray-600"
→
"flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
```

**Cancel buttons (2 occurrences):**
```
"border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
→
"border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
```

**Accounts list card:**
```
"bg-white rounded-xl border border-gray-200 p-5"
→
"bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"

"text-sm text-gray-400"   (Loading... / No member accounts yet.)
→
"text-sm text-gray-400 dark:text-gray-500"
```

**Individual account row:**
```
"border border-gray-100 rounded-lg p-4"
→
"border border-gray-100 dark:border-gray-700 rounded-lg p-4"

"font-medium text-gray-800"   (username)
→
"font-medium text-gray-800 dark:text-gray-100"

"text-xs text-gray-400"   (email)
→
"text-xs text-gray-400 dark:text-gray-500"

"text-xs text-gray-400"   (No modules granted)
→
"text-xs text-gray-400 dark:text-gray-500"

"bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded"
→
"bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs px-2 py-0.5 rounded"
```

**Edit button:**
```
"border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors"
→
"border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors"
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/accounts/page.tsx"
git commit -m "feat: dark variants for accounts page"
```

---

### Task 6: Dark variants — Performance page

**Files:**
- Modify: `app/(app)/performance/page.tsx`

- [ ] **Step 1: Apply dark variants**

**Page heading:**
```
"text-2xl font-bold text-gray-800"  →  add "dark:text-gray-100"
"text-sm text-gray-500"             →  add "dark:text-gray-400"
```

**Period select:**
```
"border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
→
"border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 shadow-sm"
```

**Loading state:**
```
"text-center py-20 text-gray-400"  →  add "dark:text-gray-500"
```

**Card component** (the `Card` function — `bg-white rounded-xl border border-gray-200 overflow-hidden`):
```
"bg-white rounded-xl border border-gray-200 overflow-hidden"
→
"bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"

"px-4 py-3 border-b border-gray-100"
→
"px-4 py-3 border-b border-gray-100 dark:border-gray-700"

"font-semibold text-gray-700 text-sm"
→
"font-semibold text-gray-700 dark:text-gray-200 text-sm"
```

**StoreTable thead:**
```
"bg-gray-50 text-left"  →  "bg-gray-50 dark:bg-gray-700 text-left"
"px-2 py-2 text-gray-500 font-medium ..."  →  add "dark:text-gray-400" (all 4 th elements)
```

**StoreTable tbody rows:**
```
"border-t border-gray-50 hover:bg-gray-50"
→
"border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"

"px-2 py-2 text-gray-400 font-medium"   (rank #)
→  add "dark:text-gray-500"

"font-medium text-gray-800"   (store name)
→  add "dark:text-gray-100"

"text-xs text-gray-400"   (sub_affiliate)
→  add "dark:text-gray-500"

"px-2 py-2 text-gray-600 truncate"   (dsp)
→  add "dark:text-gray-300"

"px-2 py-2 text-right font-medium text-gray-800"
→  add "dark:text-gray-100"

"px-4 py-12 text-center text-gray-400"   (empty state)
→  add "dark:text-gray-500"
```

**DSPTable thead + tbody:** Apply the same pattern as StoreTable above — `text-gray-500` → add `dark:text-gray-400`, `text-gray-800` → add `dark:text-gray-100`, `text-gray-400` → add `dark:text-gray-500`, row border/hover same as above.

**Blue partner badge in DSPTable:**
```
"bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded"
→
"bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs px-2 py-0.5 rounded"
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/performance/page.tsx"
git commit -m "feat: dark variants for performance page"
```

---

### Task 7: Dark variants — Marketing Efforts page

**Files:**
- Modify: `app/(app)/marketing-efforts/page.tsx`

- [ ] **Step 1: Apply dark variants**

**Page heading:**
```
"text-2xl font-bold text-gray-800"  →  add "dark:text-gray-100"
"text-sm text-gray-500"             →  add "dark:text-gray-400"
```

**Search input:**
```
"border border-gray-200 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
→
"border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
```

**Table wrapper card:**
```
"bg-white rounded-xl border border-gray-200 overflow-hidden"
→
"bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
```

**Table thead:**
```
"bg-gray-50 text-left"  →  "bg-gray-50 dark:bg-gray-700 text-left"
All "px-4 py-3 text-gray-500 font-medium"  →  add "dark:text-gray-400"
```

**Table tbody rows:**
```
"border-t border-gray-50 hover:bg-gray-50"
→
"border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"

"px-4 py-3 text-gray-600 whitespace-nowrap"   (date)
→  add "dark:text-gray-300"

"font-medium text-gray-800"   (store_name)
→  add "dark:text-gray-100"

"text-xs text-gray-400"   (sub_affiliate)
→  add "dark:text-gray-500"

"px-4 py-3 text-gray-600"   (location, activities text)
→  add "dark:text-gray-300"

"px-4 py-3 text-center font-medium text-gray-700"   (headcount)
→  add "dark:text-gray-200"

"px-4 py-3 text-right text-gray-700"   (total_deposit)
→  add "dark:text-gray-200"

"px-4 py-3 text-gray-500 max-w-xs"   (notes cell)
→  add "dark:text-gray-400"

"truncate text-xs"   (notes text — no color class, fine as-is)

"text-blue-600 hover:underline text-xs whitespace-nowrap"   (View Report link)
→  add "dark:text-blue-400"

"text-gray-300 text-xs"   (— when no report)
→  add "dark:text-gray-600"

"text-red-400 hover:text-red-600 text-xs"   (Delete button)
→  no change needed (works in dark)

"px-4 py-12 text-center text-gray-400"   (empty/loading states)
→  add "dark:text-gray-500"
```

**Add Entry modal:**
```
"fixed inset-0 bg-black/40 flex items-center justify-center z-50"  →  no change (overlay fine)

"bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
→
"bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"

"font-bold text-gray-800 mb-4"   (modal heading)
→  add "dark:text-gray-100"

All "text-xs font-medium text-gray-500 block mb-1"   (labels)
→  add "dark:text-gray-400"

All "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"   (inputs/textareas)
→  add "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"

"text-xs text-gray-500 mt-1"   (Selected file name)
→  add "dark:text-gray-400"

"text-xs text-red-600 mt-1"   (file error — fine as-is)

"px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"   (Cancel button)
→  add "dark:text-gray-300 dark:hover:bg-gray-700"
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/marketing-efforts/page.tsx"
git commit -m "feat: dark variants for marketing efforts page"
```

---

### Task 8: Dark variants — Store Directory page

**Files:**
- Modify: `app/(app)/store-directory/page.tsx`

- [ ] **Step 1: Apply dark variants**

**Page heading:**
```
"text-2xl font-bold text-gray-800"  →  add "dark:text-gray-100"
"text-sm text-gray-500"             →  add "dark:text-gray-400"
```

**Bulk Import button:**
```
"bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors"
→
"bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors"
```

**Success banner:**
```
"bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm"
→
"bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-400 px-4 py-3 rounded-lg mb-4 text-sm"
```

**Search input:**
```
"border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
→
"border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
```

**Filter buttons (inactive state in ternary):**
```
'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
→
'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
```

**Table card:**
```
"bg-white rounded-xl border border-gray-200 overflow-hidden"
→
"bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
```

**Table thead:**
```
"bg-gray-50 text-left"  →  "bg-gray-50 dark:bg-gray-700 text-left"
All th: "px-4 py-3 text-gray-500 font-medium"  →  add "dark:text-gray-400"
```

**Table tbody rows:**
```
"border-t border-gray-50 hover:bg-gray-50"
→
"border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"

"font-medium text-gray-800"   (store_name)  →  add "dark:text-gray-100"
"text-xs text-gray-400"        (sub_affiliate)  →  add "dark:text-gray-500"
"px-4 py-3 text-gray-600"     (dsp)  →  add "dark:text-gray-300"

"bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded"   (partner badge)
→  add "dark:bg-blue-900/30 dark:text-blue-400"

statusColor function — update each return value:
  'bg-green-100 text-green-700'  →  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  'bg-yellow-100 text-yellow-700'  →  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  'bg-gray-100 text-gray-500'  →  'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'

"text-blue-600 hover:text-blue-800 text-xs font-medium"   (Edit button)
→  add "dark:text-blue-400 dark:hover:text-blue-300"

"px-4 py-12 text-center text-gray-400"   (empty/loading)  →  add "dark:text-gray-500"
```

**Edit/Add modal:**
```
"bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
→
"bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl"

"font-bold text-gray-800 mb-4"  →  add "dark:text-gray-100"
All labels "text-xs font-medium text-gray-500 block mb-1"  →  add "dark:text-gray-400"
All inputs "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
→  add "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:disabled:bg-gray-600 dark:disabled:text-gray-500"

Select "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
→  add "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"

Cancel "px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
→  add "dark:text-gray-300 dark:hover:bg-gray-700"
```

**Bulk Import modal:**
```
"bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl"
→
"bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl"

"font-bold text-gray-800 mb-4"  →  add "dark:text-gray-100"

Warning banner "bg-yellow-50 border border-yellow-200 text-yellow-800 ..."
→  add "dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-400"

"font-semibold text-gray-700 mb-3"   (section headings)  →  add "dark:text-gray-200"

Mode buttons inactive: 'bg-gray-100 text-gray-600'  →  add 'dark:bg-gray-700 dark:text-gray-300'

"text-xs text-amber-600"   (warning text — fine as-is in dark)

Preview table "bg-gray-50"  →  add "dark:bg-gray-700"
Preview th "text-gray-500 font-medium"  →  add "dark:text-gray-400"
Preview rows "border-t border-gray-100"  →  add "dark:border-gray-700"
Preview td "text-gray-700"  →  add "dark:text-gray-300"
"text-xs text-gray-400 mt-2"   (row count)  →  add "dark:text-gray-500"

Error banner "bg-red-50 border border-red-200 text-red-800 ..."
→  add "dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"

Cancel "px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
→  add "dark:text-gray-300 dark:hover:bg-gray-700"
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/store-directory/page.tsx"
git commit -m "feat: dark variants for store directory page"
```

---

### Task 9: Dark variants — SSS Data page

**Files:**
- Modify: `app/(app)/sss-data/page.tsx`

- [ ] **Step 1: Apply dark variants**

**Page heading:**
```
"text-2xl font-bold text-gray-800 mb-1"  →  add "dark:text-gray-100"
```

**Date range inputs + Export button:**
```
"border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"   (both date inputs)
→  add "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"

"text-gray-400 text-sm"   ("to" label)  →  add "dark:text-gray-500"

"bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg shadow-sm transition-colors text-sm whitespace-nowrap"   (Export button)
→  add "dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
```

**Overall summary card:**
```
"bg-white rounded-xl border border-gray-200 p-5 mb-6"
→  add "dark:bg-gray-800 dark:border-gray-700"

"font-semibold text-gray-700 mb-3"   (heading)  →  add "dark:text-gray-200"

Error banner: add "dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"

"text-sm text-gray-400"   (Loading...)  →  add "dark:text-gray-500"
"text-xs text-gray-400 mb-1"   (stat labels)  →  add "dark:text-gray-500"
"font-semibold text-gray-800"   (stat values)  →  add "dark:text-gray-100"
"text-xs text-gray-400 mt-3"   (No data text)  →  add "dark:text-gray-500"
```

**Last updated text:**
```
"text-xs text-gray-400 mb-6 text-center"  →  add "dark:text-gray-500"
```

**Store Summary card:**
```
"bg-white rounded-xl border border-gray-200 p-5 mb-6"  →  add "dark:bg-gray-800 dark:border-gray-700"
"font-semibold text-gray-700 mb-3"  →  add "dark:text-gray-200"
"text-xs text-gray-400"   (No data)  →  add "dark:text-gray-500"

Table thead "bg-gray-50"  →  add "dark:bg-gray-700"
th "text-gray-500 font-medium"  →  add "dark:text-gray-400"
rows "border-t border-gray-100"  →  add "dark:border-gray-700"
td "text-gray-700"  →  add "dark:text-gray-300"
"text-xs text-gray-400 mt-2"  →  add "dark:text-gray-500"
```

**Success banner:**
```
"bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm"
→  add "dark:bg-green-900/30 dark:border-green-800 dark:text-green-400"
```

**Import modal (inside `parsed.length > 0` section):**
```
"bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl"
→  add "dark:bg-gray-800"

"font-bold text-gray-800 mb-4"  →  add "dark:text-gray-100"

Warning banners (no Partner/DSP): add "dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-400"
Success banner (Partner+DSP detected): add "dark:bg-green-900/30 dark:border-green-800 dark:text-green-400"

"font-semibold text-gray-700 mb-3"   (section headings)  →  add "dark:text-gray-200"

Mode/period buttons inactive: 'bg-gray-100 text-gray-600'  →  add 'dark:bg-gray-700 dark:text-gray-300'

"text-xs text-amber-600"   (update mode warning — fine in dark)

Select elements "border border-gray-200 rounded-lg px-3 py-2 text-sm"
→  add "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"

Date input "border border-gray-200 rounded-lg px-3 py-2 text-sm"
→  add "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"

Preview table thead "bg-gray-50"  →  add "dark:bg-gray-700"
Preview th "text-gray-500 font-medium"  →  add "dark:text-gray-400"
Preview rows "border-t border-gray-100"  →  add "dark:border-gray-700"
Preview td "text-gray-700"  →  add "dark:text-gray-300"
"text-xs text-gray-400 mt-2"   (row count)  →  add "dark:text-gray-500"

Partner badge positive: 'bg-blue-100 text-blue-700'  →  add 'dark:bg-blue-900/30 dark:text-blue-400'
Partner badge negative: 'bg-red-100 text-red-500'    →  add 'dark:bg-red-900/30 dark:text-red-400'

Error banner: add "dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"

Cancel button "px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
→  add "dark:text-gray-300 dark:hover:bg-gray-700"
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/sss-data/page.tsx"
git commit -m "feat: dark variants for sss-data page"
```

---

### Task 10: Dark variants — AI Report page

**Files:**
- Modify: `app/(app)/ai-report/page.tsx`

- [ ] **Step 1: Apply dark variants**

**Page heading:**
```
"text-2xl font-bold text-gray-800 mb-1"  →  add "dark:text-gray-100"
"text-sm text-gray-500"                  →  add "dark:text-gray-400"
```

**Copy button:**
```
"border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
→  add "dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
```

**Error banner:**
```
"bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm"
→  add "dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"
```

**Report card:**
```
"bg-white rounded-xl border border-gray-200 p-6"
→  add "dark:bg-gray-800 dark:border-gray-700"

"text-gray-400 text-sm animate-pulse"   (generating state)  →  add "dark:text-gray-500"
```

**renderReport function** — update each returned element's className:
```tsx
// h2 headers
"text-lg font-bold text-gray-800 mt-6 mb-2 pb-1 border-b border-gray-200"
→
"text-lg font-bold text-gray-800 dark:text-gray-100 mt-6 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700"

// bold paragraphs
"font-semibold text-gray-700 mt-3"
→
"font-semibold text-gray-700 dark:text-gray-200 mt-3"

// list items
"ml-4 text-gray-600 text-sm list-disc"
→
"ml-4 text-gray-600 dark:text-gray-300 text-sm list-disc"

// regular paragraphs
"text-gray-600 text-sm leading-relaxed"
→
"text-gray-600 dark:text-gray-300 text-sm leading-relaxed"
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/ai-report/page.tsx"
git commit -m "feat: dark variants for ai-report page"
```

---

### Task 11: Build verification

**Files:** none

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: exits with code 0, no TypeScript errors, no missing module errors.

- [ ] **Step 2: Manual smoke test**

Run `npm run dev`. Check each of the following:

1. Open `/login` — toggle dark via DevTools (`document.documentElement.classList.add('dark')`) — login card goes dark
2. Sign in — sidebar shows avatar with initial, no branding text
3. Click avatar — modal appears with Change Password / Dark mode toggle / Log out
4. Toggle Dark mode ON — all visible content flips dark immediately, no page reload
5. Refresh — dark mode persists, no white flash before dark loads
6. Toggle Dark mode OFF — returns to light, localStorage `theme` = `'light'`
7. Navigate through each module page — all backgrounds, cards, tables, inputs dark correctly
8. Open a modal (Marketing Efforts → Add Entry, Store Directory → Add Store) — modal is dark
9. Change Password — type a new password, click Update, see "Password updated." in green
10. Log out — redirects to `/login`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete profile modal and dark mode implementation"
```
