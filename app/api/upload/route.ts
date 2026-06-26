import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { records, period, periodType } = await request.json()

    if (!records || !period || !periodType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (records.length === 0) {
      return NextResponse.json({ error: 'Cannot upload an empty file.' }, { status: 400 })
    }

    // Auto-upsert stores master table
    const storeUpserts = records.map((r: any) => ({
      sub_affiliate: r.sub_affiliate,
      store_name: r.store_name,
      partner: r.partner || null,
      dsp: r.dsp || null,
      updated_at: new Date().toISOString(),
    }))

    await supabase
      .from('stores')
      .upsert(storeUpserts, { onConflict: 'sub_affiliate,partner', ignoreDuplicates: false })

    const perfRecords = records.map((r: any) => ({
      sub_affiliate: r.sub_affiliate,
      store_name: r.store_name,
      period,
      period_type: periodType,
      total_deposit: Math.max(0, parseFloat(r.total_deposit) || 0),
      total_withdraw: parseFloat(r.total_withdraw) || 0,
      valid_bet_amount: parseFloat(r.valid_bet_amount) || 0,
      company_net_win: parseFloat(r.company_net_win) || 0,
      payout_amount: parseFloat(r.payout_amount) || 0,
      total_promotion_amount: parseFloat(r.total_promotion_amount) || 0,
      registered_members: Math.max(0, parseInt(r.registered_members) || 0),
      first_deposit_amount: parseFloat(r.first_deposit_amount) || 0,
      first_deposit_count: parseInt(r.first_deposit_count) || 0,
      deposit_member_count: parseInt(r.deposit_member_count) || 0,
      members_withdrawn: parseInt(r.members_withdrawn) || 0,
      effective_member: parseInt(r.effective_member) || 0,
      partner: r.partner || null,
      dsp: r.dsp || null,
      updated_at: new Date().toISOString(),
    }))

    // Deduplicate within the file by (sub_affiliate, partner) — keep last row per store
    const dedupMap = new Map<string, any>()
    for (const r of perfRecords) dedupMap.set(`${r.sub_affiliate}__${r.partner ?? ''}`, r)
    const dedupedRecords = Array.from(dedupMap.values())

    const { error } = await supabase.from('performance_data').insert(dedupedRecords)
    if (error) throw error

    return NextResponse.json({ success: true, count: dedupedRecords.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
