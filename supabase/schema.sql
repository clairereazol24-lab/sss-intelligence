-- LakiWin Intelligence Engine - Supabase Schema
-- Run this in your Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STORES TABLE (master directory)
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_affiliate VARCHAR(100) UNIQUE NOT NULL,
  store_name VARCHAR(200) NOT NULL,
  partner VARCHAR(100),
  dsp VARCHAR(200),
  deployment_status VARCHAR(50) DEFAULT 'Not Deployed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PERFORMANCE DATA TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_affiliate VARCHAR(100) NOT NULL,
  store_name VARCHAR(200) NOT NULL,
  period VARCHAR(20) NOT NULL,
  period_type VARCHAR(10) NOT NULL DEFAULT 'monthly',
  total_deposit NUMERIC(15,2) DEFAULT 0,
  total_withdraw NUMERIC(15,2) DEFAULT 0,
  valid_bet_amount NUMERIC(15,2) DEFAULT 0,
  company_net_win NUMERIC(15,2) DEFAULT 0,
  payout_amount NUMERIC(15,2) DEFAULT 0,
  total_promotion_amount NUMERIC(15,2) DEFAULT 0,
  registered_members INTEGER DEFAULT 0,
  first_deposit_amount NUMERIC(15,2) DEFAULT 0,
  first_deposit_count INTEGER DEFAULT 0,
  deposit_member_count INTEGER DEFAULT 0,
  members_withdrawn INTEGER DEFAULT 0,
  effective_member INTEGER DEFAULT 0,
  partner VARCHAR(100),
  dsp VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- no unique constraint; upload route enforces replace-by-partner via delete+insert
);

-- ============================================================
-- MARKETING EFFORTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_efforts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  location VARCHAR(200),
  store_name VARCHAR(200),
  sub_affiliate VARCHAR(100),
  activities_done TEXT,
  headcount INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PERFORMANCE DATA: updated_at (tracks value changes on upsert,
-- not just new rows, so AI Report caching can detect edits)
-- ============================================================
ALTER TABLE performance_data ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- AI REPORT CACHE (avoids regenerating on every page visit;
-- only regenerates when performance_data or marketing_efforts changes)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_report_cache (
  period VARCHAR(20) PRIMARY KEY,
  report_text TEXT NOT NULL,
  data_fingerprint TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_report_cache DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES (role + display name for each Supabase Auth user)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL,
  name VARCHAR(200),
  role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- MODULE PERMISSIONS (per-member module grants; admins bypass this)
-- ============================================================
CREATE TABLE IF NOT EXISTS module_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module VARCHAR(30) NOT NULL CHECK (module IN ('dashboard', 'sss_data', 'members', 'performance', 'store_directory', 'ai_report', 'marketing_efforts')),
  PRIMARY KEY (user_id, module)
);
ALTER TABLE module_permissions DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_perf_period ON performance_data(period);
CREATE INDEX IF NOT EXISTS idx_perf_sub ON performance_data(sub_affiliate);
CREATE INDEX IF NOT EXISTS idx_perf_partner ON performance_data(partner);
CREATE INDEX IF NOT EXISTS idx_perf_dsp ON performance_data(dsp);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(deployment_status);
CREATE INDEX IF NOT EXISTS idx_marketing_date ON marketing_efforts(date);
CREATE INDEX IF NOT EXISTS idx_marketing_store ON marketing_efforts(sub_affiliate);

-- ============================================================
-- DISABLE RLS (enable later when you add authentication)
-- ============================================================
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE performance_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_efforts DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- OPERATIONS MODULE (task workspaces: Ocular, Community Marketing, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS ops_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  deadline DATE,
  is_special BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_reference_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ops_collaborators (
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS ops_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_notifications (
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

CREATE INDEX IF NOT EXISTS idx_ops_reference_links_task ON ops_reference_links(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_collaborators_user ON ops_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_ops_updates_task ON ops_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_comments_task ON ops_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_activity_log_task ON ops_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_notifications_user ON ops_notifications(user_id, is_read);

-- Allow the 'operations' module in module_permissions (was previously only
-- dashboard/sss_data/members/performance/store_directory/ai_report/marketing_efforts)
ALTER TABLE module_permissions DROP CONSTRAINT IF EXISTS module_permissions_module_check;
ALTER TABLE module_permissions ADD CONSTRAINT module_permissions_module_check
  CHECK (module IN ('dashboard', 'sss_data', 'members', 'performance', 'store_directory', 'ai_report', 'marketing_efforts', 'locked_retailers', 'operations'));

-- Seed the 4 permanent operational tasks (idempotent — skipped if already present).
-- Reference links are NOT seeded here — add the real SSS Checklist / Deployment
-- Tracker / etc. links through the app's "Manage Reference Links" UI after this
-- module ships, since no real URLs for those were available at migration time.
INSERT INTO ops_tasks (title, description, is_special)
SELECT 'Ocular', 'Monitor all ocular activities, store visits, and deployment updates.', false
WHERE NOT EXISTS (SELECT 1 FROM ops_tasks WHERE title = 'Ocular');

INSERT INTO ops_tasks (title, description, is_special)
SELECT 'Fully Deployed & New Store', 'Track newly deployed stores, DSP incentive monitoring, and deployment tracking.', false
WHERE NOT EXISTS (SELECT 1 FROM ops_tasks WHERE title = 'Fully Deployed & New Store');

INSERT INTO ops_tasks (title, description, is_special)
SELECT 'Community Marketing', 'Monitor all Community Marketing activities, reports, and player engagement updates.', false
WHERE NOT EXISTS (SELECT 1 FROM ops_tasks WHERE title = 'Community Marketing');

INSERT INTO ops_tasks (title, description, is_special)
SELECT 'Booth Activation', 'Track booth activation proposals, budgets, liquidation, and final reports.', false
WHERE NOT EXISTS (SELECT 1 FROM ops_tasks WHERE title = 'Booth Activation');

-- ============================================================
-- CALENDAR MODULE (general team events: meetings, deadlines, reminders)
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  time TEXT,
  details TEXT DEFAULT '',
  attendees TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);

-- Realtime (postgres_changes) enforces RLS — this policy must exist before the
-- client subscribes, or live updates silently stop delivering with no error.
-- All writes go through supabaseAdmin (service role) in the API routes, which
-- bypasses RLS regardless of this policy.
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON calendar_events FOR SELECT TO authenticated USING (true);

-- Allow the 'calendar' module in module_permissions
ALTER TABLE module_permissions DROP CONSTRAINT IF EXISTS module_permissions_module_check;
ALTER TABLE module_permissions ADD CONSTRAINT module_permissions_module_check
  CHECK (module IN ('dashboard', 'sss_data', 'members', 'performance', 'store_directory', 'ai_report', 'marketing_efforts', 'locked_retailers', 'operations', 'calendar'));
