# Calendar Module — Design

## Overview

A new "Calendar" module for SSS Intelligence, ported from the Kler-Management dashboard's "Events" tab (`components/CalendarModule.tsx`, `app/api/events/route.ts`). General team events — meetings, deadlines, reminders — on a month grid, not tied to any existing SSS entity (Operations tasks, stores, etc.).

## Goals

- Let any user with Calendar access view a month grid of team events and create/edit their own.
- Match the proven UX from Kler's Events tab: click a day, see that day's events in a slide-in panel, add/edit from there.
- Each event carries an optional **time**, in addition to date, title, details, and attendees.

## Non-Goals

- Not tied to Operations tasks, deadlines, or any other SSS data — purely a standalone events calendar (per user decision, 2026-07-20).
- No recurring events.
- No "Content" calendar tab (Kler's marketing-post scheduling side) — only the general Events pattern is being ported.
- No creative-ticket integration, no Telegram notifications for this module at launch.

## Data Model

```sql
-- General team events (meetings, reminders, deadlines) shown on the Calendar module's month grid
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL,               -- 'YYYY-MM-DD', matches Kler's calendar_events shape
  title TEXT NOT NULL DEFAULT '',
  time TEXT,                        -- optional, e.g. '14:00' from <input type="time">
  details TEXT DEFAULT '',
  attendees TEXT[] DEFAULT '{}',    -- display names, sourced from profiles at selection time
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- The client subscribes to postgres_changes on this table for live updates (same
-- pattern as Operations) — Realtime enforces RLS, so this policy must exist from
-- day one or live updates silently stop working. All writes go through the
-- service-role admin client in the API routes, which bypasses RLS regardless.
CREATE POLICY "authenticated_read" ON calendar_events
  FOR SELECT TO authenticated USING (true);
```

No `is_archived` column (Kler's `calendar_posts` has one for the Content tab; `calendar_events` does not, and this module only ports the Events shape).

## Access Control

- New `ModuleKey` entry in `lib/auth.ts`: `{ key: 'calendar', label: 'Calendar', href: '/calendar', icon: '📅' }`, added to the `MODULES` array. This alone wires up the sidebar nav (`app/(app)/layout.tsx`) and the per-user module grid on `/accounts` — no separate UI work needed for either.
- **Important gotcha this module must account for:** `middleware.ts`'s `moduleForPath()` only gates *page* routes (matches against `MODULES[].href`, e.g. `/calendar`), not `/api/calendar`. Every other module besides Operations relies on this middleware gate and skips its own check — but since Calendar's API needs the same per-route enforcement Operations uses, follow that pattern rather than the simpler modules' pattern.
- New `lib/calendar-access.ts`, mirroring `lib/ops-access.ts`:
  ```ts
  export async function requireCalendarAccess(): Promise<{ userId: string; access: UserAccess } | null> {
    // reads x-user-id / x-user-role / x-user-username / x-user-name / x-user-modules
    // (already verified + forwarded by middleware.ts), checks hasModuleAccess(access, 'calendar')
  }
  ```
  Every API route handler calls this first and returns 401/403 if null.
- **Create:** any user with Calendar access.
- **Edit / soft delete:** the event's creator, or an admin (`access.role === 'admin' || event.created_by === userId`).
- **Permanent delete:** admin only (SSS has no superadmin tier — this is Kler's superadmin-only behavior collapsed one tier down, since `admin` is SSS's top role).

## API Routes (`app/api/calendar/route.ts`)

- `GET ?year=&month=` — events for that month (`date` between the 1st and last day), excluding `is_deleted`
- `POST` — create; body: `{ title, date, time?, details?, attendees? }`; stamps `created_by`
- `PATCH` — update; body: `{ id, ...same fields }`; requires creator-or-admin
- `DELETE` — body: `{ id, permanent? }`; default soft-deletes (`is_deleted = true`); `permanent: true` hard-deletes and requires admin

All four call `requireCalendarAccess()` first; PATCH/DELETE additionally fetch the event's `created_by` to check ownership.

## UI (`app/(app)/calendar/page.tsx` + `CalendarClient.tsx`)

Ported from Kler's Events tab only — no view-mode toggle (no "Content" tab exists here), no marketing fields, no creative-ticket side effects.

- Month grid (Sun–Sat), month/year navigation, "Today" shortcut.
- Day cell: 1 event → title (2-line clamp) + attendee count if any; 2+ events → dot indicators + count + first event's title.
- Click a day:
  - Has events → 360px slide-in right panel, **list mode**: each event as a card (status dot, title, **time badge** top-right if set, details preview, attendee count) → click to open in edit mode. "New Event" button at the bottom for that date.
  - No events → panel opens straight into **create mode** for that date.
- Event form fields: Title (required), **Time** (`<input type="time">`, optional, labeled "(optional)"), Details (textarea), "Who's Present" — multi-select chips sourced from *all* `profiles` regardless of Calendar module access (matches Kler; attendee tagging here is informational display only, not an access gate or notification trigger, same rationale as `ops_collaborators`).
- Edit mode adds Delete (creator/admin) and Permanently Delete (admin only) actions — both behind a confirm dialog before the request fires, matching Kler's `handleEvDelete`/`handleEvHardDelete`.
- Realtime: `supabase.channel(...).on('postgres_changes', { table: 'calendar_events' }, refetch)` — client component, anon/session key, requires the `authenticated_read` policy above to actually receive events.
- Mobile: floating action button to quickly add an event for today, same as Kler.

## Open Questions / Assumptions Carried Over from Kler

- `attendees` stores display names as plain text (not user IDs) — matches Kler exactly; means a later name change on `profiles` won't retroactively update past events' attendee lists. Accepted as-is since Kler has the same behavior.
- `date`/`time` stored as `TEXT`, not `DATE`/`TIME` Postgres types — matches Kler's actual live schema (verified via live OpenAPI schema pull, not guessed).
