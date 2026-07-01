import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') // 'all' or specific period like '2024-02'
    const fromPeriod = searchParams.get('from')
    const toPeriod = searchParams.get('to')

    const partner = searchParams.get('partner')

    let query = supabase.from('performance_data').select('*')

    if (partner) {
      query = query.eq('partner', partner)
    }

    if (period && period !== 'all') {
      query = query.eq('period', period)
    } else if (fromPeriod && toPeriod) {
      query = query.gte('period', fromPeriod).lte('period', toPeriod)
    }

    // Paginate to fetch all rows regardless of dataset size
    const allData: any[] = []
    let start = 0
    const PAGE = 1000
    while (true) {
      const { data: page, error } = await query.range(start, start + PAGE - 1)
      if (error) throw error
      if (!page || page.length === 0) break
      allData.push(...page)
      if (page.length < PAGE) break
      start += PAGE
    }
    const data = allData

    // Aggregate by store (sum across periods if multiple)
    const storeMap: Record<string, any> = {}
    for (const row of data || []) {
      const storeKey = `${row.sub_affiliate}__${row.partner ?? ''}`
      if (!storeMap[storeKey]) {
        storeMap[storeKey] = {
          sub_affiliate: row.sub_affiliate,
          store_name: row.store_name,
          partner: row.partner,
          dsp: row.dsp,
          total_deposit: 0,
          total_withdraw: 0,
          valid_bet_amount: 0,
          company_net_win: 0,
          payout_amount: 0,
          registered_members: 0,
          deposit_member_count: 0,
          members_withdrawn: 0,
          effective_member: 0,
          first_deposit_count: 0,
        }
      }
      const s = storeMap[storeKey]
      s.total_deposit += row.total_deposit
      s.total_withdraw += row.total_withdraw
      s.valid_bet_amount += row.valid_bet_amount
      s.company_net_win += row.company_net_win
      s.payout_amount += row.payout_amount
      s.registered_members += row.registered_members
      s.deposit_member_count += row.deposit_member_count
      s.members_withdrawn += row.members_withdrawn
      s.effective_member += row.effective_member
      s.first_deposit_count += row.first_deposit_count
    }

    // Merge in stores from directory that have no performance data
    let dirQuery = supabase.from('stores').select('sub_affiliate, store_name, partner, dsp')
    if (partner) dirQuery = dirQuery.eq('partner', partner)
    const { data: dirStores } = await dirQuery
    for (const ds of dirStores || []) {
      const key = `${ds.sub_affiliate}__${ds.partner ?? ''}`
      if (!storeMap[key]) {
        storeMap[key] = {
          sub_affiliate: ds.sub_affiliate,
          store_name: ds.store_name,
          partner: ds.partner,
          dsp: ds.dsp,
          total_deposit: 0,
          total_withdraw: 0,
          valid_bet_amount: 0,
          company_net_win: 0,
          payout_amount: 0,
          registered_members: 0,
          deposit_member_count: 0,
          members_withdrawn: 0,
          effective_member: 0,
          first_deposit_count: 0,
        }
      }
    }

    const stores = Object.values(storeMap)
    const allStores = [...stores].sort((a: any, b: any) => b.total_deposit - a.total_deposit)

    const overallTotals = stores.reduce(
      (acc: any, s: any) => {
        acc.total_deposit += s.total_deposit
        acc.total_withdraw += s.total_withdraw
        acc.company_net_win += s.company_net_win
        acc.registered_members += s.registered_members
        acc.deposit_member_count += s.deposit_member_count
        acc.effective_member += s.effective_member
        acc.store_count += 1
        return acc
      },
      {
        total_deposit: 0,
        total_withdraw: 0,
        company_net_win: 0,
        registered_members: 0,
        deposit_member_count: 0,
        effective_member: 0,
        store_count: 0,
      }
    )

    const top50Stores = [...stores]
      .sort((a: any, b: any) => b.total_deposit - a.total_deposit)
      .slice(0, 50)

    const top50StoresByMembers = [...stores]
      .sort((a: any, b: any) => b.registered_members - a.registered_members)
      .slice(0, 50)

    const top50StoresByGGR = [...stores]
      .sort((a: any, b: any) => b.company_net_win - a.company_net_win)
      .slice(0, 50)

    // Aggregate by DSP
    const dspMap: Record<string, any> = {}
    for (const s of stores) {
      const dspKey = (s as any).dsp || 'Unknown'
      const partnerKey = (s as any).partner || 'Unknown'
      const key = `${dspKey}__${partnerKey}`
      if (!dspMap[key]) {
        dspMap[key] = { dsp: dspKey, partner: partnerKey, store_count: 0, total_deposit: 0, total_grr: 0, registered_members: 0 }
      }
      dspMap[key].store_count += 1
      dspMap[key].total_deposit += (s as any).total_deposit
      dspMap[key].total_grr += (s as any).company_net_win
      dspMap[key].registered_members += (s as any).registered_members
    }

    const top50DSPs = Object.values(dspMap)
      .sort((a: any, b: any) => b.store_count - a.store_count)
      .slice(0, 50)

    const top50DSPsByDeposit = Object.values(dspMap)
      .sort((a: any, b: any) => (b as any).total_deposit - (a as any).total_deposit)
      .slice(0, 50)

    const top50DSPsByMembers = Object.values(dspMap)
      .sort((a: any, b: any) => (b as any).registered_members - (a as any).registered_members)
      .slice(0, 50)

    const top50DSPsByGGR = Object.values(dspMap)
      .sort((a: any, b: any) => (b as any).total_grr - (a as any).total_grr)
      .slice(0, 50)

    // Available periods
    const { data: periods } = await supabase
      .from('performance_data')
      .select('period')
      .order('period', { ascending: false })
      .range(0, 9999)

    const uniquePeriods = Array.from(new Set((periods || []).map((p: any) => p.period)))

    // Most recently uploaded row for this partner
    let lastRowQuery = supabase
      .from('performance_data')
      .select('period, period_type')
      .order('updated_at', { ascending: false })
      .limit(1)
    if (partner) lastRowQuery = lastRowQuery.eq('partner', partner)
    const { data: lastRow } = await lastRowQuery

    const lastUpdated = lastRow && lastRow.length > 0 ? lastRow[0] : null

    return NextResponse.json({ top50Stores, top50StoresByMembers, top50StoresByGGR, top50DSPs, top50DSPsByDeposit, top50DSPsByGGR, top50DSPsByMembers, periods: uniquePeriods, overallTotals, allStores, lastUpdated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
