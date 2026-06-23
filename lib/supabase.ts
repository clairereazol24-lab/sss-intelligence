import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Store = {
  id: string
  sub_affiliate: string
  store_name: string
  partner: string | null
  dsp: string | null
  deployment_status: string
  created_at: string
  updated_at: string
}

export type PerformanceData = {
  id: string
  sub_affiliate: string
  store_name: string
  period: string
  period_type: string
  total_deposit: number
  total_withdraw: number
  valid_bet_amount: number
  company_net_win: number
  payout_amount: number
  total_promotion_amount: number
  registered_members: number
  first_deposit_amount: number
  first_deposit_count: number
  deposit_member_count: number
  members_withdrawn: number
  effective_member: number
  partner: string | null
  dsp: string | null
}

export type MarketingEffort = {
  id: string
  date: string
  location: string
  store_name: string
  sub_affiliate: string
  activities_done: string
  headcount: number
  notes: string
  created_at: string
}
