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
  module VARCHAR(30) NOT NULL CHECK (module IN ('sss_data', 'performance', 'store_directory', 'ai_report', 'marketing_efforts')),
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
