# Auth & Accounts Design

**Goal:** Add authentication to LakiWin Intelligence Engine (currently fully open, no login at all) plus an admin-only Accounts page for creating and managing member logins with per-module access control.

**Context:** This is sub-project 1 of 2. Sub-project 2 (collapsible sidebar, theme toggle, sidebar footer redesign) depends on this one existing (it needs a logged-in user to show) and will be designed separately afterward.

## Roles

Two roles, flat (no hierarchy beyond this):
- **admin** — exactly one account (the user). Bypasses all module-permission checks; always sees every module plus the Accounts page.
- **member** — every account created via the Accounts page. Sees only the modules explicitly granted to them. Never sees the Accounts page, even via direct URL.

There is no UI to promote a member to admin or create a second admin. The single admin account is seeded out-of-band (see "Manual setup" below) and marked via direct DB update.

## Data Model

Two new tables, added to `supabase/schema.sql` and run manually by the user in Supabase SQL Editor (the app's anon key cannot run DDL):

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
```

A row in `module_permissions` grants that member access to that module. Absence = no access. Admins are never checked against this table — `role = 'admin'` short-circuits every permission check to "allow all."

RLS stays disabled, consistent with the rest of this app's tables — access control is enforced in the Next.js app layer (middleware + page guards), not in Postgres policies.

## Auth Mechanism

Supabase Auth (email/password), using `@supabase/ssr` for cookie-based sessions compatible with the Next.js App Router (new dependency — the app currently only has `@supabase/supabase-js`).

- `lib/supabase-server.ts` — server-side Supabase client (reads/writes the auth cookie), for use in Server Components, Route Handlers, and middleware.
- `lib/supabase-browser.ts` — browser Supabase client (replaces the current bare `lib/supabase.ts` client for any client-component usage that needs auth awareness; existing data-fetching usages of `lib/supabase.ts` are unaffected).
- `middleware.ts` (new, project root) — runs on every request:
  - No session + path is not `/login` → redirect to `/login`.
  - Has session + path is `/login` → redirect to `/` (or first permitted module).
  - Otherwise refreshes the session cookie and continues.

No public sign-up page exists anywhere. The only way into the system is a login created by the admin via the Accounts page (or the admin's own out-of-band account).

## Login / Logout

- `/login` — email + password form, calls `supabase.auth.signInWithPassword`. On success, redirects to `/` (which itself redirects to the first module the user can access).
- Logout — calls `supabase.auth.signOut()`. The trigger button itself lives in the sidebar footer, which is sub-project 2's scope; this sub-project just needs the logout handler/route to exist and work when called (e.g. exposed as a small exported function or API route sub-project 2 can wire a button to).

## Module Access Enforcement

- **Sidebar nav filtering:** the nav item list is filtered down to modules the current user has access to (admin = all 5; member = whatever rows exist for them in `module_permissions`). A member with zero granted modules sees an empty nav (edge case, allowed — admin just hasn't granted anything yet).
- **Direct-URL guard:** each module page (or a shared layout/wrapper for the module route group) checks access server-side and redirects to `/` if the current user isn't allowed, so members can't bypass the sidebar filtering by typing a URL.
- **Accounts page guard:** `/accounts` checks `role === 'admin'`; anything else redirects to `/`.

## Accounts Page (`/accounts`, admin-only)

- **List view:** every member account — email, username, the modules they're granted (as badges), created date. The admin account itself is not shown in this list (it's not a "managed" account).
- **Add account:** form with email, initial password, username, and a checkbox per module. Submits to `POST /api/accounts`, which:
  1. Calls `supabase.auth.admin.createUser({ email, password, email_confirm: true })` using the **service role key** (server-only — never sent to the browser).
  2. Inserts a `profiles` row (`role: 'member'`, the given username).
  3. Inserts one `module_permissions` row per checked module.
- **Edit account:** change username, change which module checkboxes are checked, optionally set a new password (the admin's manual-reset path — calls `supabase.auth.admin.updateUserById` with a new password). Submits to `PATCH /api/accounts/:id`.
- **No delete** in this pass — not requested; can be added later if needed.

## Manual Setup Required Before Implementation

Two one-time actions only the user can take, both outside this codebase:

1. **Service role key:** copy it from Supabase → Project Settings → API, add as `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (no `NEXT_PUBLIC_` prefix — must never reach the browser bundle) and to the Vercel project's environment variables.
2. **Seed the admin account:** create the admin's own login directly in Supabase → Authentication → Users → "Add user" (the user sets their own email + password there, never typed into this chat or stored by the app). Once created, a `profiles` row is inserted for that user's id with `role = 'admin'` — done by id/email lookup, the password itself is never read or handled by any code here.

Implementation cannot proceed past basic scaffolding until both of these are done.

## Out of Scope (this sub-project)

- Collapsible sidebar, icon-only mode, theme (light/dark) toggle, sidebar footer redesign — sub-project 2.
- Self-service password reset via email.
- Promoting members to admin, multiple admins.
- Account deletion/deactivation.
