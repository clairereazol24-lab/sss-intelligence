# Collapsible Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app sidebar collapsible — toggle in the footer shrinks it to 64px (icons only, hover tooltips) or expands it to 240px (full labels), with an animated width transition and localStorage persistence.

**Architecture:** All logic lives in `components/Sidebar.tsx` (already a `'use client'` component). A `collapsed` boolean is stored in React state, read from localStorage via `useEffect` after mount. A `mounted` boolean gates the CSS transition so the sidebar does not animate on initial page load (preventing a flash). A local `NavLink` helper component is extracted to avoid duplicating the icon + tooltip markup for each nav entry.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS, TypeScript

## Global Constraints

- Only `components/Sidebar.tsx` is modified — no other files touched
- localStorage key: exactly `'sidebar-collapsed'` (string)
- Collapsed width: `w-16` (64px). Expanded width: `w-60` (240px)
- CSS transition: `transition-all duration-300 ease-in-out` — added to root div only after mount (suppressed on first render to prevent flash)
- Toggle chevron characters: `‹` to collapse (when expanded), `›` to expand (when collapsed) — Unicode characters, no icon library
- Tooltip: `bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap`, positioned `left-full ml-2 top-1/2 -translate-y-1/2`, shown via `opacity-0 group-hover:opacity-100 transition-opacity`, `pointer-events-none z-50`
- No new npm dependencies
- TypeScript must compile cleanly: `npm run build` exits 0
- All existing Vitest tests must pass: `npm test` shows same count as baseline

---

### Task 1: Collapsible Sidebar

This is the entire feature — one file change.

**Files:**
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `ModuleDef` from `@/lib/auth` — shape is `{ key: string; label: string; href: string; icon: string }`
- Produces: same `export default function Sidebar({ modules, role, username }: SidebarProps)` signature — callers unchanged

- [ ] **Step 1: Read the current file**

Read `components/Sidebar.tsx` in full to understand the existing structure before making changes. Confirm the import of `ModuleDef` from `@/lib/auth` and the `ProfileModal` import from `./ProfileModal`.

- [ ] **Step 2: Establish test baseline**

Run: `npm test`

Note the exact number of passing tests in the output. If any tests are already failing, stop and report — do not proceed.

- [ ] **Step 3: Write the new `components/Sidebar.tsx`**

Replace the entire file with:

```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ProfileModal from './ProfileModal'
import type { ModuleDef } from '@/lib/auth'

type SidebarProps = {
  modules: ModuleDef[]
  role: 'admin' | 'member'
  username: string
}

function NavLink({
  href,
  icon,
  label,
  active,
  collapsed,
}: {
  href: string
  icon: string
  label: string
  active: boolean
  collapsed: boolean
}) {
  return (
    <div className="relative group">
      <Link
        href={href}
        className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
          collapsed ? 'justify-center py-2.5 px-0' : 'gap-3 px-3 py-2.5'
        } ${
          active
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <span className="text-base flex-shrink-0">{icon}</span>
        {!collapsed && <span>{label}</span>}
      </Link>
      {collapsed && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          {label}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ modules, role, username }: SidebarProps) {
  const pathname = usePathname()
  const [profileOpen, setProfileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true')
    setMounted(true)
  }, [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  return (
    <div
      className={`${collapsed ? 'w-16' : 'w-60'} bg-slate-900 text-white flex flex-col flex-shrink-0 overflow-hidden ${
        mounted ? 'transition-all duration-300 ease-in-out' : ''
      }`}
    >
      {/* Header */}
      <div
        className={`border-b border-slate-700 ${
          collapsed ? 'p-4 flex justify-center items-center' : 'p-6'
        }`}
      >
        {collapsed ? (
          <span className="text-lg font-bold text-white">L</span>
        ) : (
          <>
            <h1 className="text-lg font-bold text-white tracking-wide">LakiWin</h1>
            <p className="text-xs text-slate-400 mt-0.5">Intelligence Engine</p>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {modules.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={pathname === item.href}
            collapsed={collapsed}
          />
        ))}
        {role === 'admin' && (
          <NavLink
            href="/accounts"
            icon="⚙️"
            label="Accounts"
            active={pathname === '/accounts'}
            collapsed={collapsed}
          />
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 p-4 space-y-1">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className={`flex items-center w-full hover:bg-slate-800 rounded-lg px-2 py-2 transition-colors ${
            collapsed ? 'justify-center' : 'gap-3'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">
              {(username[0] ?? '?').toUpperCase()}
            </span>
          </div>
          {!collapsed && (
            <span className="text-sm text-slate-300 truncate">{username}</span>
          )}
        </button>
        {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
        <button
          onClick={toggle}
          className="w-full flex justify-center py-1.5 text-slate-400 hover:text-white transition-colors text-lg"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run TypeScript build**

Run: `npm run build`

Expected: exits 0, output lists all pages compiled, zero TypeScript errors.

If it fails: read the error carefully. Most likely issue is a Tailwind class being split across a template literal — Tailwind requires full class names (e.g., `w-16` not `w-${n}`). The code above uses static classes so this should be clean.

- [ ] **Step 5: Verify tests still pass**

Run: `npm test`

Expected: same number of passing tests as Step 2. These are utility-function unit tests unrelated to the sidebar component — the count should be identical.

- [ ] **Step 6: Verify visually with dev server**

Run: `npm run dev`

Open the app in a browser and verify each of the following:

1. **Expanded state (default):** Sidebar shows "LakiWin" + "Intelligence Engine" in header, all nav labels visible, username visible next to avatar, `‹` toggle button at the bottom of the footer.
2. **Collapse:** Click `‹` → sidebar animates to narrow (64px), header shows only `"L"`, nav shows only emoji icons, avatar shows without username, toggle button now shows `›`.
3. **Tooltips:** Hover over a nav icon while collapsed → label appears as a floating tooltip to the right of the icon.
4. **Expand:** Click `›` → sidebar animates back to full width.
5. **Persistence:** While collapsed, hard-refresh the page → sidebar stays collapsed (no flash, no animation on load).
6. **ProfileModal:** Click avatar while collapsed → ProfileModal still opens in correct position.
7. **Dark mode:** Toggle dark mode from ProfileModal → sidebar background stays dark (it was already dark; no regression expected).
8. **Active link:** Navigate between pages → active nav item still shows blue highlight in both states.

- [ ] **Step 7: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: collapsible sidebar with icons-only mode and localStorage persistence"
```
