# Collapsible Sidebar — Design Spec
**Date:** 2026-06-26
**Project:** SSS Intelligence (LakiWin Intelligence Engine)

---

## Overview

Add a toggle to the sidebar footer that collapses the sidebar to an icons-only strip (64px) or expands it to full width (240px). Width animates with a CSS transition. State persists in localStorage across visits. Nav labels appear as tooltip overlays on hover when collapsed.

---

## A — State & Persistence

- Boolean `collapsed` state lives entirely inside `components/Sidebar.tsx` (already `'use client'`; no context or prop drilling needed)
- Initialize from `localStorage.getItem('sidebar-collapsed') === 'true'` using a lazy `useState` initializer so the correct state is read synchronously before first render
- On toggle: flip state + `localStorage.setItem('sidebar-collapsed', String(!collapsed))`
- localStorage key: `'sidebar-collapsed'`

---

## B — Width & Animation

Root div of Sidebar gains `transition-all duration-300 ease-in-out` and switches between:

| State | Class |
|---|---|
| Expanded | `w-60` (240px) |
| Collapsed | `w-16` (64px) |

`overflow-hidden` on the root ensures no content bleeds out during animation.

---

## C — Header

| State | Contents |
|---|---|
| Expanded | `"LakiWin"` h1 + `"Intelligence Engine"` p (current) |
| Collapsed | Centered `"L"` monogram only (same `font-bold text-white`, no subtitle) |

Entire header div padding adjusts: `p-6` expanded → `p-4 flex justify-center items-center` collapsed.

---

## D — Nav Links

Each nav link wrapper gets `relative group` for tooltip support.

| Part | Expanded | Collapsed |
|---|---|---|
| Icon `<span>` | Always visible, `text-base` | Always visible, centered |
| Label text | Visible | Hidden (`hidden` class) |
| Tooltip | Not rendered | Absolute div, `left-full ml-2`, appears on `group-hover` |

Tooltip markup (rendered only when collapsed):
```tsx
<div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
  {label}
</div>
```

`linkClass()` helper adjusts padding: `px-3 gap-3` expanded → `px-0 justify-center` collapsed.

---

## E — Footer

| Part | Expanded | Collapsed |
|---|---|---|
| Avatar circle | Visible | Visible, centered |
| Username text `<span>` | Visible | Hidden |
| ProfileModal | `fixed bottom-16 left-4` (unchanged — viewport-anchored, works at any sidebar width) |
| Toggle button | Full-width row below avatar | Same (icon-only, centered) |

Toggle button sits at the very bottom of the footer div, below the avatar row. It renders:
- Expanded: `‹` chevron (collapse action)
- Collapsed: `›` chevron (expand action)
- Style: `w-full flex justify-center py-1.5 text-slate-400 hover:text-white transition-colors text-lg`

---

## F — Files Changed

| File | Change |
|---|---|
| `components/Sidebar.tsx` | All collapse logic, animation, tooltip, toggle button |

No other files need changes. The layout (`app/(app)/layout.tsx`) renders `<Sidebar>` with no width constraint of its own — Sidebar's root div already controls its own `w-60` width, so switching that class is sufficient.

---

## Out of Scope

- Mobile breakpoint behavior (sidebar is desktop-only in current design)
- Keyboard shortcut for toggle
- Any state shared outside Sidebar (no context needed)
