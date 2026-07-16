# Operations Task Management Module — Design

## Overview

A new "Operations" module for SSS Intelligence. Not a generic Kanban project tracker — each task is a **persistent operational workspace** (Ocular, Community Marketing, etc.) that the team continuously updates with reports, references, and discussion, rather than a ticket that moves through a pipeline and closes.

## Goals

- Centralize communication, reference links, and reporting for each major SSS operation in one place.
- Let any team member with access post operational updates and discuss, without needing admin approval per-post.
- Alert the team (in-app + Telegram) when someone is mentioned or posts an update/comment, and send a daily digest of task activity.

## Non-Goals

- Not a full project-management tool — no Kanban status pipeline, no task assignment workflow, no time tracking.
- No file upload/storage — attachments are links only (Drive, Sheets, or any URL).
- No email notifications (in-app + Telegram only).

## Default Tasks

Seeded once via migration (idempotent — skip if a task with the same title already exists):

1. **Ocular** — Reference Links: SSS Checklist
2. **Fully Deployed & New Store** — Reference Links: DSP Incentive, Deployment Tracker
3. **Community Marketing** — Reference Links: Community Marketing Guide, Reporting Sheet, Budget Tracker
4. **Booth Activation** — Reference Links: Proposal, Budget, Liquidation, Final Report
5. **Special Tasks** — created manually by admins as needed, no default reference links

The first four cannot be deleted (only Special Tasks can be deleted, and only by admins).

## Data Model

```sql
-- Permanent operational workspaces + manually-created special tasks
CREATE TABLE ops_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  deadline DATE,
  is_special BOOLEAN NOT NULL DEFAULT false, -- special tasks are the only ones that can be deleted or archived
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Named reference link buttons per task
CREATE TABLE ops_reference_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Collaborators assigned to a task (informational + mention/notification targeting,
-- NOT an access gate — any member with module access can post to any task)
CREATE TABLE ops_collaborators (
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

-- Official operational reporting timeline
CREATE TABLE ops_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]', -- [{ "label": string, "url": string }]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discussion thread, separate from Updates
CREATE TABLE ops_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-logged change history
CREATE TABLE ops_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action_text TEXT NOT NULL, -- e.g. "changed Priority to High"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- In-app notification center
CREATE TABLE ops_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('mention', 'update', 'comment', 'deadline')),
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ops_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_reference_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_collaborators DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_updates DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_activity_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE ops_notifications DISABLE ROW LEVEL SECURITY;
```

`module_permissions.module` CHECK constraint gets `'operations'` added to its allowed values.

All access goes through `supabaseAdmin` (RLS deny-all pattern already used elsewhere in this app); authorization is enforced in API routes via `canDo`/`getUserAccess`-style checks against `profiles.role` and `module_permissions`.

## Board & Task Detail UI

**Board** (`/operations`): responsive card grid, no Kanban columns/status pipeline. One card per task showing Title, Priority badge (🟢 Low / 🟡 Medium / 🔴 High), unread-update indicator, comment count, collaborator avatars. Archived tasks hidden by default behind a "Show Archived" toggle. Admin-only "+ New Special Task" button.

**Task Detail** (slide-over panel or `/operations/[id]`), top to bottom:

1. Title, Priority badge, Archive toggle (admin-only, Special Tasks only)
2. Description
3. Reference Links — row of labeled pill buttons (e.g. 📄 SSS Checklist); add/edit/reorder is admin-only
4. Priority selector (admin-only)
5. Deadline — optional date (admin-only)
6. Collaborators — avatar list; add/remove is admin-only
7. Updates feed — newest first; shows user, date, time, body, link attachments; any member with module access can post
8. Comments feed — visually separated from Updates (different background/border); supports `@Name` mention autocomplete sourced from `profiles`; any member can post
9. Activity History — collapsed accordion at the bottom; auto-populated entries (e.g. "Claire changed Priority to High")

**Realtime**: board and task-detail views subscribe to their respective tables via Supabase Realtime so changes appear live across everyone with the page/panel open, without a manual refresh.

## Notifications

**In-app**: bell icon in the header, dropdown listing unread `ops_notifications` rows for the current user, mark-as-read on click/open.

**Telegram**: new dedicated bot (created via @BotFather specifically for this), added by the user into their existing team group chat. Chat ID obtained after the bot is added by sending it a message and reading `getUpdates`. A new `lib/telegram.ts` mirrors Kler-Management's existing implementation (same fetch-based send, same `/@[A-Z]\w*/` mention regex), but points at this new bot token/chat ID via its own env vars — kept fully separate from Kler-Management's bot.

- **Immediate send** (fired synchronously from the API route that creates the row): new `@mention` in an Update or Comment, new Update posted, new Comment posted.
- **Daily cron digest** (Vercel Cron, same 9AM PHT schedule Kler-Management uses): a "daily movement" activity report — every Comment and Update posted in the last 24 hours, grouped by task, batched into one message. Skipped (no message sent) if nothing was posted. This replaced an earlier deadline-reminder design; `deadline` is now a display-only field on each task (still shown, still editable) with no scheduled Telegram nudge tied to it.

**Mentions**: `@Name` typed in Updates or Comments is autocompleted against `profiles` and, on submit, resolved via the same mention regex used by Kler-Management. Resolved mentions create an `ops_notifications` row (type `mention`) and trigger the immediate Telegram send.

## Permissions

Reuses the existing `profiles.role` (`admin` / `member`) — no new role is introduced.

- **Admin**: everything a member can do, plus — create/archive/delete Special Tasks (the 4 permanent tasks cannot be deleted), edit Title/Description, manage Reference Links, set Priority/Deadline, add/remove Collaborators.
- **Member** (with `operations` in `module_permissions`): full read on all tasks; can post Updates, Comments, and link-attachments on **any** task regardless of whether they're listed as a Collaborator (Collaborators is informational/for mention-targeting, not an access gate); cannot edit task metadata, reference links, or collaborators.

## Attachments

Links only — no file upload, no storage bucket. An attachment is `{ label, url }`; the UI renders it as a clickable labeled button (e.g. 📷 "Event Photos", 📄 "Final Report") pointing at wherever the file actually lives (Drive, Sheets, etc.).

## Navigation

New top-level sidebar entry **"Operations"** (📋 icon), added to the `MODULES` array in `lib/auth.ts`, gated by the new `operations` module-permission key — identical pattern to every other module in this app (`dashboard`, `sss_data`, `members`, etc.).

## Open Questions Resolved During Brainstorming

- Kanban status columns were dropped entirely in favor of a flat card list; the only state left is an Active/Archived toggle.
- Updates and Comments remain two separate feeds per the original written spec (not merged into one, despite an early rough mockup suggesting a single feed).
- Multiple named reference links per task are kept (not a single link field).
- Telegram uses a brand-new bot/chat, immediate-send for social activity (mentions/updates/comments), cron digest for deadlines only.
