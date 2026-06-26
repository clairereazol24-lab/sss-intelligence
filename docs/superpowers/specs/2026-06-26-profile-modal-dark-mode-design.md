# Profile Modal & Dark Mode — Design Spec
**Date:** 2026-06-26
**Project:** SSS Intelligence (LakiWin Intelligence Engine)

---

## Overview

Two related changes to the sidebar and app shell:

1. Replace the "Relevant Tech · Alpharus" branding block in the sidebar footer with a clickable profile button that opens a self-service modal (change password, theme toggle, logout).
2. Add a real app-wide dark mode driven by Tailwind's `darkMode: 'class'` strategy, toggled from the profile modal, persisted in localStorage, and applied before first paint to prevent a light-flash.

---

## A — Profile Button (Sidebar Footer)

**Current:** Bottom section has a static "Relevant Tech · Alpharus" label, username text, and a plain Logout button.

**New:** A single clickable row replacing the entire bottom section:
- 40px circular avatar — `bg-slate-700` background, white uppercase first character of `username`
- Username text to the right of the avatar
- Clicking anywhere on the row opens the profile modal
- The row has a hover state (`hover:bg-slate-800`) for affordance

No separate logout button in the sidebar — logout lives inside the modal only.

---

## B — Profile Modal

A fixed-position floating panel (not a full-screen overlay) anchored bottom-left, appearing just above the sidebar footer area. Dimensions: 280px wide, auto height.

**Backdrop:** A transparent fixed inset-0 div rendered behind the panel; clicking it closes the modal.

**Three sections (stacked, separated by dividers):**

### 1. Change Password
- Label: "Change Password"
- Single `<input type="password">` field (placeholder: "New password")
- "Update" button — on click: calls `supabase.auth.updateUser({ password: value })` directly from the client (self-service, no admin API)
- Inline feedback below the button: green "Password updated." on success, red error message on failure
- Input clears on success
- Button shows "Updating…" while in-flight; disabled during request

### 2. Theme
- Row: "Dark mode" label on the left + pill toggle switch on the right
- Toggle state = current theme (dark = on, light = off)
- On toggle: adds/removes `dark` class on `document.documentElement`, saves `'dark'` or `'light'` to `localStorage.setItem('theme', ...)`
- No page reload required — Tailwind's class strategy reacts immediately

### 3. Logout
- A single "Log out" button (full width, subtle red-tinted style)
- Calls `supabase.auth.signOut()` then `router.push('/login')`

---

## C — Dark Mode System

### tailwind.config.js
Add `darkMode: 'class'` at the root of the config object.

### Anti-flash inline script (app/layout.tsx)
Add a `<script>` tag inside `<head>` **before any stylesheet**:
```js
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch(e){}
})();
```
This runs synchronously during HTML parse, before the browser renders a single pixel, eliminating any light-flash on reload for dark-mode users.

### ThemeProvider (components/ThemeProvider.tsx)
A `'use client'` component that:
- On mount, reads `localStorage.getItem('theme')` and syncs `document.documentElement.classList` (handles hydration mismatch edge cases)
- Exposes a `useTheme()` hook (or just a context) so the profile modal toggle can call `setTheme('dark' | 'light')`
- Wraps the `<body>` in `app/layout.tsx`

### app/layout.tsx changes
```tsx
<html lang="en">
  <head>
    <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();` }} />
  </head>
  <body className={inter.className}>
    <ThemeProvider>{children}</ThemeProvider>
  </body>
</html>
```

---

## D — Dark Color Map

Applied across all page files (`app/(app)/**/*.tsx`) and the app layout. The sidebar (`bg-slate-900`) is already dark and needs no changes.

| Element | Light class | Added dark class |
|---|---|---|
| Page background | `bg-gray-50` | `dark:bg-gray-900` |
| Cards / panels | `bg-white` | `dark:bg-gray-800` |
| Primary text | `text-gray-800` | `dark:text-gray-100` |
| Secondary text | `text-gray-700` | `dark:text-gray-200` |
| Muted text | `text-gray-600` | `dark:text-gray-300` |
| Placeholder / label | `text-gray-500` | `dark:text-gray-400` |
| Dimmed text | `text-gray-400` | `dark:text-gray-500` |
| Card borders | `border-gray-200` | `dark:border-gray-700` |
| Inner borders | `border-gray-100` | `dark:border-gray-700` |
| Table header bg | `bg-gray-50` | `dark:bg-gray-700` |
| Table row hover | `hover:bg-gray-50` | `dark:hover:bg-gray-700` |
| Inputs | `border-gray-200` (implicit white bg) | `dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100` |
| Blue badges | `bg-blue-50 text-blue-700` | `dark:bg-blue-900/30 dark:text-blue-400` |
| Error banner | `bg-red-50 border-red-200 text-red-700` | `dark:bg-red-900/30 dark:border-red-800 dark:text-red-400` |
| Select dropdowns | `bg-white` | `dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100` |

---

## Files Changed

| File | Change |
|---|---|
| `tailwind.config.js` | Add `darkMode: 'class'` |
| `app/layout.tsx` | Anti-flash script + ThemeProvider wrapper |
| `components/ThemeProvider.tsx` | New — client component, localStorage sync, context |
| `components/ProfileModal.tsx` | New — modal with password, theme, logout |
| `components/Sidebar.tsx` | Replace footer with avatar button + render ProfileModal |
| `app/(app)/layout.tsx` | Add `dark:bg-gray-900` to the shell background |
| `app/(app)/page.tsx` | Dark text variants |
| `app/(app)/accounts/page.tsx` | Dark variants throughout |
| `app/(app)/performance/page.tsx` | Dark variants throughout |
| `app/(app)/marketing-efforts/page.tsx` | Dark variants throughout |
| `app/(app)/store-directory/page.tsx` | Dark variants throughout |
| `app/(app)/sss-data/page.tsx` | Dark variants throughout |
| `app/(app)/ai-report/page.tsx` | Dark variants throughout |
| `app/login/page.tsx` | Dark variants (login page background + card) |

---

## Out of Scope

- Admin "reset a member's password" in Accounts — separate existing feature, not touched
- Supabase email confirmation for password change — not applicable (direct `updateUser` with service role not needed; client-side `updateUser` works for authenticated users)
- Per-module theme customization
- System-preference detection (`prefers-color-scheme`) — user controls theme manually via the toggle
