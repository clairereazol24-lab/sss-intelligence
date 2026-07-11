import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

const DISPLAY_DAYS = 14
const RETENTION_LOOKBACK_DAYS = 7
const FETCH_DAYS = DISPLAY_DAYS + RETENTION_LOOKBACK_DAYS // 21

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return toDateString(d)
}

type DayRow = {
  period: string
  sub_affiliate: string
  store_name: string
  registered_members: number
  first_deposit_count: number
  deposit_member_count: number
  effective_member: number
  total_deposit: number
}

type DayTotals = {
  registered_members: number
  first_deposit_count: number
  deposit_member_count: number
  effective_member: number
  total_deposit: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const partner = searchParams.get('partner')
    if (!partner) {
      return NextResponse.json({ error: 'partner is required' }, { status: 400 })
    }

    const startDate = daysAgo(FETCH_DAYS - 1)
    const endDate = daysAgo(0)

    // Paginate to fetch all rows regardless of dataset size (Supabase/PostgREST
    // caps a single request at 1000 rows by default; a partner with many stores
    // over a 21-day window can exceed that)
    const allData: DayRow[] = []
    let start = 0
    const PAGE = 1000
    while (true) {
      const { data: page, error } = await supabase
        .from('performance_data')
        .select('period, sub_affiliate, store_name, registered_members, first_deposit_count, deposit_member_count, effective_member, total_deposit')
        .eq('partner', partner)
        .eq('period_type', 'daily')
        .gte('period', startDate)
        .lte('period', endDate)
        .order('period')
        .order('sub_affiliate')
        .range(start, start + PAGE - 1)

      if (error) throw error
      if (!page || page.length === 0) break
      allData.push(...(page as DayRow[]))
      if (page.length < PAGE) break
      start += PAGE
    }
    const rows = allData

    // Aggregate by day across every store for this partner
    const dayMap: Record<string, DayTotals> = {}
    for (const r of rows) {
      if (!dayMap[r.period]) {
        dayMap[r.period] = { registered_members: 0, first_deposit_count: 0, deposit_member_count: 0, effective_member: 0, total_deposit: 0 }
      }
      const d = dayMap[r.period]
      d.registered_members += r.registered_members || 0
      d.first_deposit_count += r.first_deposit_count || 0
      d.deposit_member_count += r.deposit_member_count || 0
      d.effective_member += r.effective_member || 0
      d.total_deposit += r.total_deposit || 0
    }

    const allDates: string[] = []
    for (let i = FETCH_DAYS - 1; i >= 0; i--) allDates.push(daysAgo(i))
    const earliestFetchedDate = allDates[0]
    const displayDates = allDates.slice(FETCH_DAYS - DISPLAY_DAYS)

    const registeredOn = (date: string) => dayMap[date]?.registered_members ?? 0

    const series = displayDates.map(date => {
      const day = dayMap[date]
      const hasData = !!day

      const conversion_rate = hasData && day.registered_members > 0
        ? (day.first_deposit_count / day.registered_members) * 100
        : null

      const avg_deposit_per_member = hasData && day.deposit_member_count > 0
        ? day.total_deposit / day.deposit_member_count
        : null

      const dateObj = new Date(date)
      const trailingStart = new Date(dateObj)
      trailingStart.setUTCDate(trailingStart.getUTCDate() - (RETENTION_LOOKBACK_DAYS - 1))
      const trailingStartStr = toDateString(trailingStart)

      let retention_7d: number | null = null
      if (hasData && trailingStartStr >= earliestFetchedDate) {
        let sum7 = 0
        for (let i = 0; i < RETENTION_LOOKBACK_DAYS; i++) {
          const dd = new Date(dateObj)
          dd.setUTCDate(dd.getUTCDate() - i)
          sum7 += registeredOn(toDateString(dd))
        }
        retention_7d = sum7 > 0 ? (day.registered_members / sum7) * 100 : null
      }

      return {
        date,
        registered_members: hasData ? day.registered_members : null,
        effective_member: hasData ? day.effective_member : null,
        total_deposit: hasData ? day.total_deposit : null,
        conversion_rate,
        avg_deposit_per_member,
        retention_7d,
      }
    })

    // Per-store breakdown. Total Deposit stays scoped to the 14-day display
    // window (recent performance), but Registered Members is the store's
    // overall all-time total (matching /performance and /api/performance) —
    // not windowed, since "Registered Members" means "how many members has
    // this store ever registered," not "how many registered recently."
    const storeMap: Record<string, { store_name: string; total_deposit: number }> = {}
    const displayStart = displayDates[0]
    for (const r of rows) {
      if (r.period < displayStart) continue
      if (!storeMap[r.sub_affiliate]) {
        storeMap[r.sub_affiliate] = { store_name: r.store_name, total_deposit: 0 }
      }
      storeMap[r.sub_affiliate].total_deposit += r.total_deposit || 0
    }

    // All-time registered_members per store, across every uploaded period
    // (daily and monthly alike) for this partner.
    const allTimeRegistered: Record<string, number> = {}
    let rStart = 0
    while (true) {
      const { data: page, error } = await supabase
        .from('performance_data')
        .select('sub_affiliate, registered_members')
        .eq('partner', partner)
        .range(rStart, rStart + PAGE - 1)
      if (error) throw error
      if (!page || page.length === 0) break
      for (const r of page as { sub_affiliate: string; registered_members: number }[]) {
        allTimeRegistered[r.sub_affiliate] = (allTimeRegistered[r.sub_affiliate] || 0) + (r.registered_members || 0)
      }
      if (page.length < PAGE) break
      rStart += PAGE
    }

    // "Effective Member" for the store breakdown is the current count of
    // active-status members per store, from the members table (the real
    // per-member records) — not the daily uploaded snapshot. This is a "right
    // now" count, not a windowed one, since member status has no history.
    const activeCounts: Record<string, number> = {}
    let mStart = 0
    while (true) {
      const { data: page, error } = await supabase
        .from('members')
        .select('sub_affiliate, status')
        .eq('partner', partner)
        .range(mStart, mStart + PAGE - 1)
      if (error) throw error
      if (!page || page.length === 0) break
      for (const m of page as { sub_affiliate: string; status: string }[]) {
        if ((m.status || '').toLowerCase() === 'active') {
          activeCounts[m.sub_affiliate] = (activeCounts[m.sub_affiliate] || 0) + 1
        }
      }
      if (page.length < PAGE) break
      mStart += PAGE
    }

    const storeBreakdown = Object.entries(storeMap)
      .map(([sub_affiliate, s]) => ({
        store_name: s.store_name,
        registered_members: allTimeRegistered[sub_affiliate] || 0,
        effective_member: activeCounts[sub_affiliate] || 0,
        total_deposit: s.total_deposit,
      }))
      .sort((a, b) => b.total_deposit - a.total_deposit)

    return NextResponse.json({ series, storeBreakdown })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
