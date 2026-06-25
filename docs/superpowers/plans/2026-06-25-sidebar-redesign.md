# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapsible icon-only sidebar, a profile modal (change password / theme / logout) replacing the inline footer, and app-wide light/dark theming.

**Architecture:** Tailwind's `darkMode: 'class'` strategy, toggled via `document.documentElement.classList` and persisted in `localStorage`, applied via an inline anti-flash script in the root layout's `<head>`. Sidebar gains local collapse state (also `localStorage`-persisted) and a new `ProfileModal` component triggered by clicking an avatar in the footer. Every existing page gets `dark:` variants added alongside its existing light-mode classes using one consistent, finite color mapping — additive only, no light-mode behavior changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (`darkMode: 'class'`), `localStorage` for both preferences (theme, sidebar-collapsed — explicitly client-only/per-browser, not synced server-side per the spec). No automated test suite — verification is `npx tsc --noEmit` + `npm run build` + manual browser checks (this plan is almost entirely visual; browser verification matters more than usual here).

**Depends on:** the Accounts Revision plan (`docs/superpowers/plans/2026-06-25-accounts-revision.md`) should be merged first if both are in flight, since Task 4 here touches `app/login/page.tsx`, which that plan also modifies. If Accounts Revision hasn't shipped yet, Task 4's snippet for `app/login/page.tsx` should be applied on top of whatever that plan leaves rather than the version shown in this plan's "before" state.

## Global Constraints

- Sidebar's own colors (`bg-slate-900`, `border-slate-700`, `text-slate-300/400`) do NOT get dark: variants — they're already dark and unaffected by the light/dark toggle. Only the main content area (every page under `app/(app)/` plus `app/login/page.tsx`) gets themed.
- Theme and sidebar-collapsed state are `localStorage`-only (keys `theme` — `'light'` | `'dark'`, absent = light; `sidebar-collapsed` — `'true'` | absent). No server/DB storage, no per-account preference.
- No system `prefers-color-scheme` detection — manual toggle only, defaults to light.
- Theme toggle lives exclusively in the profile modal — no other entry point.
- **Dark-mode color mapping** — every file touched in Task 4 must use exactly this table (verified against every color utility class actually present in the 7 page files via a full grep pass before this plan was written — nothing outside this table should need a new mapping; if a task implementer finds a class not listed here, stop and flag it rather than guessing):

  | Light class | Add this dark: variant |
  |---|---|
  | `bg-white` | `dark:bg-slate-800` |
  | `bg-gray-50` | `dark:bg-slate-900` |
  | `bg-gray-100` | `dark:bg-slate-700` |
  | `bg-blue-50` | `dark:bg-blue-900/30` |
  | `bg-blue-100` | `dark:bg-blue-900/40` |
  | `bg-blue-300` | `dark:bg-blue-700` |
  | `bg-green-50` | `dark:bg-green-900/30` |
  | `bg-green-100` | `dark:bg-green-900/40` |
  | `bg-red-50` | `dark:bg-red-900/30` |
  | `bg-red-100` | `dark:bg-red-900/40` |
  | `bg-red-300` | `dark:bg-red-700` |
  | `bg-yellow-50` | `dark:bg-yellow-900/30` |
  | `bg-yellow-100` | `dark:bg-yellow-900/40` |
  | `border-gray-50` | `dark:border-slate-700` |
  | `border-gray-100` | `dark:border-slate-700` |
  | `border-gray-200` | `dark:border-slate-600` |
  | `border-green-200` | `dark:border-green-700` |
  | `border-red-200` | `dark:border-red-700` |
  | `border-yellow-200` | `dark:border-yellow-700` |
  | `text-gray-400` | `dark:text-gray-500` |
  | `text-gray-500` | `dark:text-gray-400` |
  | `text-gray-600` | `dark:text-gray-300` |
  | `text-gray-700` | `dark:text-gray-200` |
  | `text-gray-800` | `dark:text-gray-100` |
  | `text-amber-600` | `dark:text-amber-400` |
  | `text-blue-600` | `dark:text-blue-400` |
  | `text-blue-700` | `dark:text-blue-300` |
  | `text-green-600` | `dark:text-green-400` |
  | `text-green-700` | `dark:text-green-300` |
  | `text-green-800` | `dark:text-green-300` |
  | `text-red-400` | `dark:text-red-300` |
  | `text-red-500` | `dark:text-red-400` |
  | `text-red-600` | `dark:text-red-400` |
  | `text-red-700` | `dark:text-red-300` |
  | `text-red-800` | `dark:text-red-300` |
  | `text-yellow-700` | `dark:text-yellow-300` |
  | `text-yellow-800` | `dark:text-yellow-300` |
  | `hover:bg-gray-50` | `dark:hover:bg-slate-700` |
  | `hover:bg-gray-100` | `dark:hover:bg-slate-700` |
  | `hover:text-red-600` | `dark:hover:text-red-400` |
  | `hover:text-blue-800` | `dark:hover:text-blue-300` |

  Classes **not** in this table (`bg-blue-600`, `bg-red-600`, `hover:bg-blue-700`, `hover:bg-red-700`, and any plain white text on a colored button) are solid action-button colors that already read fine on both themes — leave them untouched, do not add a `dark:` variant for them.

---

### Task 1: Tailwind dark mode + anti-flash script

**Files:**
- Modify: `tailwind.config.js`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `dark` class on `<html>` toggles every `dark:` utility in the app. Set before paint by the inline script, toggled later by `ProfileModal` (Task 2).

- [ ] **Step 1: Enable class-based dark mode**

Replace `tailwind.config.js`:

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

- [ ] **Step 2: Add the anti-flash theme-init script**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LakiWin Intelligence',
  description: 'Store Intelligence Engine',
}

const themeInitScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme')
    if (theme === 'dark') document.documentElement.classList.add('dark')
  } catch (e) {}
})()
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean. (No visual change yet — nothing emits a `dark:` class until later tasks, and nothing sets `theme` in `localStorage` until Task 2.)

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js app/layout.tsx
git commit -m "Enable class-based dark mode with anti-flash init script"
```

---

### Task 2: ProfileModal + Sidebar (collapse, avatar trigger, footer cleanup)

**Files:**
- Create: `components/ProfileModal.tsx`
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase-browser.ts`; `ModuleDef` from `lib/auth.ts`.
- Produces: `ProfileModal({ username, onClose }: { username: string; onClose: () => void })`. `Sidebar` keeps its existing `{ modules, role, username }` prop signature — no change needed in `app/(app)/layout.tsx`.

This task removes the "Relevant Tech · Alpharus" text and the old standalone Logout button (both shipped in the Auth & Accounts feature) — they're replaced by the avatar trigger and the modal's Logout entry.

- [ ] **Step 1: Create `components/ProfileModal.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type ProfileModalProps = {
  username: string
  onClose: () => void
}

export default function ProfileModal({ username, onClose }: ProfileModalProps) {
  const [isDark, setIsDark] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMessage, setPwMessage] = useState('')
  const [pwError, setPwError] = useState('')
  const router = useRouter()

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {}
  }

  const handleChangePassword = async () => {
    setPwError('')
    setPwMessage('')
    if (!newPassword) return
    setPwSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPwMessage('Password updated.')
      setNewPassword('')
    } catch (err: any) {
      setPwError(err.message || 'Failed to update password.')
    } finally {
      setPwSaving(false)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">{username}</h2>

        <div className="mb-5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Change Password</p>
          {pwError && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg mb-2 text-xs">
              {pwError}
            </div>
          )}
          {pwMessage && (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 px-3 py-2 rounded-lg mb-2 text-xs">
              {pwMessage}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="flex-1 border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleChangePassword}
              disabled={pwSaving || !newPassword}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-3 py-2 rounded-lg text-sm transition-colors"
            >
              {pwSaving ? '...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="mb-5 flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">Theme</p>
          <button
            onClick={toggleTheme}
            className="border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors"
          >
            {isDark ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-slate-600">
          <button
            onClick={handleLogout}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium text-sm transition-colors"
          >
            Logout
          </button>
          <button
            onClick={onClose}
            className="border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 font-medium px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `components/Sidebar.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleDef } from '@/lib/auth'
import ProfileModal from './ProfileModal'

type SidebarProps = {
  modules: ModuleDef[]
  role: 'admin' | 'member'
  username: string
}

export default function Sidebar({ modules, role, username }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true')
    } catch {}
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem('sidebar-collapsed', String(next))
    } catch {}
  }

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === href ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`

  return (
    <div className={`bg-slate-900 text-white flex flex-col flex-shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>
      <div className="p-6 border-b border-slate-700 overflow-hidden">
        {collapsed ? (
          <h1 className="text-lg font-bold text-white tracking-wide">L</h1>
        ) : (
          <>
            <h1 className="text-lg font-bold text-white tracking-wide">LakiWin</h1>
            <p className="text-xs text-slate-400 mt-0.5">Intelligence Engine</p>
          </>
        )}
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {modules.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)} title={collapsed ? item.label : undefined}>
            <span className="text-base">{item.icon}</span>
            {!collapsed && item.label}
          </Link>
        ))}
        {role === 'admin' && (
          <Link href="/accounts" className={linkClass('/accounts')} title={collapsed ? 'Accounts' : undefined}>
            <span className="text-base">⚙️</span>
            {!collapsed && 'Accounts'}
          </Link>
        )}
      </nav>
      <div className="p-4 border-t border-slate-700 space-y-3">
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-2 w-full text-left hover:bg-slate-800 rounded-lg p-1.5 transition-colors"
        >
          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
            {username ? username.charAt(0).toUpperCase() : '?'}
          </span>
          {!collapsed && <span className="text-xs text-slate-300 truncate">{username}</span>}
        </button>
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center w-full text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg py-1.5 transition-colors text-xs"
        >
          {collapsed ? '»' : '« Collapse'}
        </button>
      </div>
      {showProfile && <ProfileModal username={username} onClose={() => setShowProfile(false)} />}
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

With the dev server running and logged in: click the collapse button, confirm the sidebar shrinks to icons-only and labels appear as hover tooltips; click again, confirm it expands. Reload the page — confirm the collapsed state survived (localStorage). Click the avatar — confirm the modal opens with your name, a password field, a theme button, Logout, and Close. Click the theme button — confirm `<html>` gets a `dark` class (inspect via devtools; full page styling doesn't change yet until Task 3, but the sidebar's own colors are unaffected either way since they were never themed). Click Close, then Logout — confirm you land on `/login`.

- [ ] **Step 5: Commit**

```bash
git add components/ProfileModal.tsx components/Sidebar.tsx
git commit -m "Add collapsible sidebar and profile modal (change password, theme, logout)"
```

---

### Task 3: Dark mode — apply the color mapping across every page

**Files:**
- Modify: `app/(app)/sss-data/page.tsx`
- Modify: `app/(app)/performance/page.tsx`
- Modify: `app/(app)/store-directory/page.tsx`
- Modify: `app/(app)/ai-report/page.tsx`
- Modify: `app/(app)/marketing-efforts/page.tsx`
- Modify: `app/(app)/accounts/page.tsx`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: the dark-mode color mapping table in this plan's Global Constraints section. No code interfaces — this task only adds CSS utility classes, it does not change any component's props, state, or logic.

This task is mechanical: for every `className` string in each of the 7 files listed above, find every light-mode color utility class (`bg-*`, `text-*`, `border-*`, `hover:bg-*`, `hover:text-*`) that appears in the Global Constraints mapping table, and append its `dark:` counterpart directly after it in the same string (space-separated, like any other Tailwind class). Do not change anything else — no logic, no structure, no classes outside the table. If you encounter a color utility class actually used in one of these 7 files that is NOT in the table, stop and report it rather than guessing a mapping (the table was built from an exhaustive grep of these exact files, so this should not happen — if it does, something about the file changed since this plan was written, and it needs a controller decision, not a guess).

Example of the transformation (this exact pattern is what every change in this task looks like), using a real line from `app/login/page.tsx`:

Before:
```tsx
<div className="min-h-screen flex items-center justify-center bg-gray-50">
  <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 w-full max-w-sm">
    <h1 className="text-lg font-bold text-gray-800 mb-1">LakiWin</h1>
    <p className="text-sm text-gray-500 mb-6">Sign in to Intelligence Engine</p>
```

After:
```tsx
<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
  <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 p-8 w-full max-w-sm">
    <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">LakiWin</h1>
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Sign in to Intelligence Engine</p>
```

Apply the same kind of transformation to every `className` in all 7 files, using the table — not just the classes shown in this one example (e.g. `bg-blue-50`, `text-green-600`, `border-red-200`, and every other table entry that appears anywhere in these 7 files must get its mapped counterpart too).

- [ ] **Step 1: Apply the mapping to all 7 files**

Work through each file, file by file, applying the table to every matching class.

- [ ] **Step 2: Verify — build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 3: Manual browser check**

With the dev server running: log in, open the profile modal, toggle to dark — visit every one of the 7 pages and confirm backgrounds are dark, text is light and readable (no dark-text-on-dark-background or light-text-on-light-background spots), and borders/cards are still visually distinct from their background. Toggle back to light and confirm nothing regressed from before this task (light mode should look identical to how it looked before Task 3, since this task is purely additive).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/sss-data/page.tsx" "app/(app)/performance/page.tsx" "app/(app)/store-directory/page.tsx" "app/(app)/ai-report/page.tsx" "app/(app)/marketing-efforts/page.tsx" "app/(app)/accounts/page.tsx" app/login/page.tsx
git commit -m "Add dark mode classes across all pages"
```

---

## Self-Review Notes

- **Spec coverage:** B1 (collapsible sidebar) → Task 2; B2 (profile modal: change password / theme / logout, footer text removed) → Task 2; B3 (app-wide dark mode, localStorage persistence, anti-flash) → Tasks 1 + 3.
- **Placeholder scan:** Task 3 is intentionally a mechanical "apply this table" instruction rather than a full per-file diff — flagged here as a deliberate, bounded exception: the table itself is exact and exhaustive (built from a full grep of the actual files), and one complete worked example is given, so the rule being applied is fully specified even though every individual line isn't pre-written. This is the one task in this plan that isn't literal verbatim code.
- **Type consistency:** `ProfileModal`'s prop shape (`{ username, onClose }`) is used consistently in Task 2 Step 2's `Sidebar` render (`<ProfileModal username={username} onClose={() => setShowProfile(false)} />`) — no drift. `Sidebar`'s own prop shape (`{ modules, role, username }`) is unchanged from the shipped Auth & Accounts feature, so `app/(app)/layout.tsx` needs no changes in this plan.
