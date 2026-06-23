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

    let query = supabase.from('performance_data').select('*')

    if (period && period !== 'all') {
      query = query.eq('period', period)
    } else if (fromPeriod && toPeriod) {
      query = query.gte('period', fromPeriod).lte('period', toPeriod)
    }

    const { data, error } = await query
    if (error) throw error

    // Aggregate by store (sum across periods if multiple)
    const storeMap: Record<string, any> = {}
    for (const row of data || []) {
      if (!storeMap[row.sub_affiliate]) {
        storeMap[row.sub_affiliate] = {
          sub_affiliate: row.sub_affiliate,
          store_name: row.store_name,
          partner: row.partner,
          dsp: row.dsp,
          total_deposit: 0,
          total_withdraw: 0,
          company_net_win: 0,
          registered_members: 0,
          deposit_member_count: 0,
          members_withdrawn: 0,
          effective_member: 0,
          first_deposit_count: 0,
        }
      }
      const s = storeMap[row.sub_affiliate]
      s.total_deposit += row.total_deposit
      s.total_withdraw += row.total_withdraw
      s.company_net_win += row.company_net_win
      s.registered_members += row.registered_members
      s.deposit_member_count += row.deposit_member_count
      s.members_withdrawn += row.members_withdrawn
      s.effective_member += row.effective_member
      s.first_deposit_count += row.first_deposit_count
    }

    const stores = Object.values(storeMap)

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

    const maxDeposit = Math.max(...stores.map((s: any) => s.total_deposit), 1)

    // Calculate score & sort
    const storesWithScore = stores.map((s: any) => {
      const depositScore = (s.total_deposit / maxDeposit) * 100
      const activationRate = s.registered_members > 0
        ? (s.deposit_member_count / s.registered_members) * 100 : 0
      const ggrMargin = s.total_deposit > 0
        ? Math.min(Math.max((s.company_net_win / s.total_deposit) * 100, 0), 100) : 0
      const retention = s.deposit_member_count > 0
        ? Math.max((1 - s.members_withdrawn / s.deposit_member_count) * 100, 0) : 0
      const score = (depositScore * 0.35) + (activationRate * 0.30) + (ggrMargin * 0.25) + (retention * 0.10)
      const label = score >= 80 ? 'Scale' : score >= 50 ? 'Maintain' : 'Fix'
      return { ...s, score: Math.round(score), label }
    })

    const top20Stores = storesWithScore
      .sort((a: any, b: any) => b.total_deposit - a.total_deposit)
      .slice(0, 20)

    // Aggregate by DSP
    const dspMap: Record<string, any> = {}
    for (const s of stores) {
      const dspKey = (s as any).dsp || 'Unknown'
      const partnerKey = (s as any).partner || 'Unknown'
      const key = `${dspKey}__${partnerKey}`
      if (!dspMap[key]) {
        dspMap[key] = { dsp: dspKey, partner: partnerKey, store_count: 0, total_deposit: 0, total_grr: 0 }
      }
      dspMap[key].store_count += 1
      dspMap[key].total_deposit += (s as any).total_deposit
      dspMap[key].total_grr += (s as any).company_net_win
    }

    const top20DSPs = Object.values(dspMap)
      .sort((a: any, b: any) => b.store_count - a.store_count)
      .slice(0, 20)

    // Available periods
    const { data: periods } = await supabase
      .from('performance_data')
      .select('period')
      .order('period', { ascending: false })

    const uniquePeriods = Array.from(new Set((periods || []).map((p: any) => p.period)))

    return NextResponse.json({ top20Stores, top20DSPs, periods: uniquePeriods, overallTotals })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
