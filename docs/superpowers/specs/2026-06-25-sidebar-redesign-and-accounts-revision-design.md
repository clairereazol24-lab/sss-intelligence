# Sidebar Redesign & Accounts Revision Design

**Goal:** Revise the just-shipped Accounts page (username-based login instead of email, table layout, admin visibility) and build sub-project 2 from the original auth/sidebar request: a collapsible sidebar, a profile modal (change password / theme / logout), and app-wide dark mode.

**Context:** This follows directly from live feedback on the Auth & Accounts feature (merged 2026-06-25, commit `fb51b57`). Two related-but-separable pieces of work, covered in one spec because they were requested together; each gets its own task sequence at the planning stage so they can be implemented and reviewed independently.

## Part A — Accounts Page Revision

### A1. Username replaces email as the visible login identifier

Supabase Auth requires an email internally, but the UI never shows or asks for one again. Every account (admin and members) is identified by a `username` used to log in.

- A synthetic email is generated from the username for Supabase Auth's internal use: `${slug(username)}@lakiwin.internal`, where `slug()` lowercases and replaces anything that isn't `[a-z0-9._-]` with `-`. This value is never displayed anywhere in the UI.
- Creating an account with a username that's already taken fails naturally — Supabase rejects a duplicate email — and the API surfaces this as `"Username already taken."` rather than a raw Supabase error string.
- `/login` changes its "Email" field/label to "Username"; on submit, it derives the same synthetic email via the same `slug()` function and calls `signInWithPassword({ email: syntheticEmail, password })`. The slug function must be identical in both places (extracted to a shared helper) or logins will silently fail for any username containing characters the two implementations slug differently.
- The existing admin account (seeded manually before any of this code existed) was created directly in Supabase Authentication with a real email (`claire@racphil.com`), not a synthetic one. This revision does not migrate that account — it keeps logging in with the real email already in `auth.users`, since there is no `username` stored for it to derive a slug from. (See A2 — the admin will get a `username` value once shown in the list, but that's a display label, not a re-derivation of their login email.)

### A2. `profiles.username` becomes the account list's primary identifier; admin is now listed

- The Accounts page list includes the admin's own row (looked up via `role = 'admin'`), rendered with a read-only "Admin" badge — no Edit button, no password-reset field, no module checkboxes (admins bypass `module_permissions` entirely, so there's nothing to show there beyond "All modules").
- Member rows keep their existing Edit capability (username, password reset, module checkboxes) — unchanged from the shipped behavior.

### A3. Table layout: Username | Name | Password | Access

Both creating an account and viewing the list use a consistent 4-column table, replacing the current card-based "Add Account" form and list:

- **Username** — the login identifier (A1).
- **Name** — display name (was previously the only "username" field — this is a rename/clarification, not new data; the underlying `profiles.username` column is reused as "Name" while the new login identifier is a distinct value). To avoid a confusing rename of an existing column, the plan should add a new column for the login identifier (e.g. `profiles.login_id` or reuse the table's existing `username` for the login id and add a new `display_name` column for "Name" — this exact column-naming decision belongs in the implementation plan, not this spec, since either direction is workable; the spec's requirement is just that the UI shows two distinct fields, Username and Name, both persisted).
- **Password** — write-only in the form (create: required; edit: optional, blank = unchanged). Never displayed back.
- **Access** — for members, the module checkboxes/badges (unchanged set of 5 modules); for the admin row, a static "All modules" label.

New account creation and editing both happen inline in this table (consistent with the column layout), not in a separate modal/card.

## Part B — Sidebar Redesign

### B1. Collapsible sidebar

A toggle button in the sidebar footer switches between full width (~240px, icon + label nav) and collapsed (~64px, icon-only nav, label shown as a tooltip on hover). State persists in `localStorage` (key `sidebar-collapsed`) so it's remembered across page loads/visits, read on mount before first paint to avoid a width flash.

### B2. Profile modal replaces the inline footer

The sidebar footer's "Relevant Tech · Alpharus" text and the inline username+logout row (both shipped in the Auth & Accounts feature) are removed and replaced by:

- A clickable circular avatar (the user's first initial) + their display name, in the footer.
- Clicking opens a modal (centered overlay, not a dropdown) with three sections:
  - **Change Password** — the *current* user changes their own password. A "New Password" input + "Confirm" button calling `supabase.auth.updateUser({ password })` directly via the browser client — no admin involvement, and distinct from the admin's existing "reset a member's password" capability in Accounts (Part A), which remains unchanged.
  - **Theme** — a light/dark toggle (B3).
  - **Logout** — moves here from its current standalone button; same `signOut()` → redirect-to-`/login` behavior as already shipped.

When the sidebar is collapsed (B1), the avatar still shows and is still clickable — the modal isn't affected by collapse state.

### B3. App-wide dark mode

A real two-theme system, not just a sidebar-only toggle:

- Driven by Tailwind's `dark:` variant, toggled via a `class="dark"` on `<html>`, consistent with Tailwind's standard `darkMode: 'class'` strategy (a `tailwind.config.js` change).
- Every existing page (SSS Data, Performance, Store Directory, AI Report, Marketing Efforts, Accounts, Login) gets dark-mode classes alongside their existing light-mode ones: light backgrounds (`bg-white`, `bg-gray-50`) get a `dark:bg-*` counterpart, dark text (`text-gray-800`, `text-gray-600`) gets a `dark:text-*` counterpart that reads light-on-dark, borders adjust similarly. The Sidebar's existing `bg-slate-900` dark styling stays as-is in both themes (it was already dark before this feature) — only the main content area and its pages change between themes.
- Preference persists in `localStorage` (key `theme`, values `'light'` | `'dark'`), defaulting to `'light'` if unset. Applied via an inline script in the root `<head>` (runs before React hydrates) so there's no flash of the wrong theme on load.
- Toggled exclusively from the profile modal (B2) — no other entry point in this pass.

## Out of Scope

- Migrating the existing admin's real email (`claire@racphil.com`) to a synthetic one — not needed, current login continues to work as-is (A1).
- System/OS-level theme detection (`prefers-color-scheme`) — manual toggle only, defaulting to light.
- Per-member theme/collapse preferences stored server-side — both are local-only (`localStorage`), per-browser, not per-account.
- Any change to the admin-side "reset a member's password" flow already shipped in Accounts — Part B2's self-service change-password is additive, not a replacement.

## Self-Review

- **Spec coverage:** all 4 points from the feedback message map to a section — admin visibility (A2), field restructure (A1/A3), profile modal with change-password/theme/logout (B2), removing the footer text (B2), collapsible sidebar (B1), dark theme (B3).
- **Scope check:** Part A (Accounts revision) and Part B (Sidebar redesign) touch almost entirely different files (API routes + Accounts page vs. Sidebar + every page's className list + root layout/config) and have no hard ordering dependency on each other — they'll get split into two separate implementation plans, executable in either order, per the writing-plans scope check.
- **Ambiguity resolved inline:** the exact `profiles` column-naming decision for "Name" vs. the new login identifier is deferred to the plan (noted explicitly in A3) since it's an implementation detail with two workable directions, not a design ambiguity.
