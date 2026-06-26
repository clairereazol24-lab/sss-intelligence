# Accounts Page Redesign — Design Spec
**Date:** 2026-06-26
**Project:** SSS Intelligence (LakiWin Intelligence Engine)

---

## Overview

Three related changes:

1. Add a `name` (first name) field to user profiles.
2. Replace visible email with a synthetic `username@lakiwin.internal` email — email disappears as a user-facing concept everywhere.
3. Redesign the Accounts page as a 4-column table (Username | Name | Password | Access), including the admin account as a read-only row.
4. Update the login page: "Email" → "Username", translated to synthetic email before Supabase call.

---

## A — Database

Add one column to the `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN name TEXT;
```

Existing rows will have `name = NULL` — acceptable, the UI shows a blank cell. No backfill required.

This is a manual step run in the Supabase SQL editor before deployment.

---

## B — Synthetic Email

**Format:** `${username.trim().toLowerCase()}@lakiwin.internal`

Applied in two places:

### API — account creation (`POST /api/accounts`)
- Remove `email` from the required/accepted request body fields.
- Generate `email` server-side: `const email = \`${username.trim().toLowerCase()}@lakiwin.internal\``
- Pass to `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`
- Username uniqueness is enforced automatically: Supabase rejects duplicate emails, which map 1-to-1 to usernames.

### Login page (client-side)
- User types their username into the Username field.
- Before calling `signInWithPassword`, construct: `const email = username.trim().toLowerCase() + '@lakiwin.internal'`
- Pass `email` (not `username`) to `supabase.auth.signInWithPassword({ email, password })`

---

## C — API Changes

### `GET /api/accounts`
- Include the **admin account** in the response (remove the `.eq('role', 'member')` filter — fetch all profiles).
- Include `name` field from profiles.
- **Drop `email`** from the response shape — callers no longer receive or display it.
- Response shape per account: `{ id, username, name, role, modules }`

### `POST /api/accounts`
- Accept: `{ username, name, password, modules }`
- Reject: any `email` field (ignored if sent)
- Required: `username`, `password` (name is optional but shown blank if omitted)
- Generate synthetic email server-side before `createUser`
- Insert `name` into `profiles` row alongside `username` and `role`

### `PATCH /api/accounts/[id]`
- Accept optional `name` in body — update `profiles.name` if present
- If `username` is being changed, also update the Supabase Auth email to `${newUsername.trim().toLowerCase()}@lakiwin.internal` via `supabaseAdmin.auth.admin.updateUserById(userId, { email: newEmail })`
- Other fields (`password`, `modules`) unchanged in behavior

---

## D — Accounts Page (`app/(app)/accounts/page.tsx`)

Full rewrite as a proper `<table>`.

### Table structure

| Column | Display | Edit mode |
|---|---|---|
| Username | `{username}` text | `<input>` |
| Name | `{name}` text (blank if null) | `<input>` |
| Password | `••••••••` | `<input type="password">` (blank = keep current) |
| Access | Module badges | Inline checkboxes |

### Admin row
- Username cell: `{username}` + grey "Admin" badge (`bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded`)
- Name cell: `{name}` (read-only text)
- Password cell: `—`
- Access cell: `—`
- No Edit button

### Member rows — display mode
- Username, Name shown as text
- Password shows `••••••••`
- Access shows blue module badges (existing badge style)
- Last cell: "Edit" button

### Member rows — edit mode
- All four cells become inputs inline
- Password input: placeholder "New password (optional)", blank = no change
- Access: checkboxes for each module (MODULES array from `@/lib/auth`)
- Last cell: "Save" + "Cancel" buttons

### Add Account row
- "+ Add Account" button (top-right header, same position as now)
- Clicking appends a blank editable row at the bottom of the table
- All four inputs shown; Password is required for new accounts
- Last cell: "Create" + "Cancel" buttons
- On "Cancel": row removed; on "Create" success: row replaced with the new account's display row

### Error display
- Page-level error banner (same red banner style as now) for load/save errors

### Type shape (client-side)
```ts
type Account = {
  id: string
  username: string
  name: string | null
  role: 'admin' | 'member'
  modules: string[]
}
```

---

## E — Login Page (`app/login/page.tsx`)

- Label `Email` → `Username`
- `<input type="email" ...>` → `<input type="text" ...>` (removes browser email format validation)
- State variable renamed: `email` → `username`
- Before `signInWithPassword`: `const email = username.trim().toLowerCase() + '@lakiwin.internal'`
- Pass `email` to Supabase, not `username`
- All other markup unchanged

---

## Files Changed

| File | Change |
|---|---|
| Supabase dashboard (manual) | `ALTER TABLE profiles ADD COLUMN name TEXT` |
| `app/api/accounts/route.ts` | GET includes admin + name, drops email; POST generates synthetic email, accepts name |
| `app/api/accounts/[id]/route.ts` | PATCH accepts optional name |
| `app/(app)/accounts/page.tsx` | Full rewrite as 4-column table |
| `app/login/page.tsx` | Email → Username field, synthetic email transform |

---

## Out of Scope

- Migrating existing real emails to synthetic format (no existing members have real emails — the app is new)
- Showing the synthetic email anywhere in the UI
- Password reset via email (not applicable — synthetic emails are not real inboxes)
- Password reset via email (not applicable — synthetic emails are not real inboxes)
