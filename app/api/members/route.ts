import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_COLUMNS = 'username, sub_affiliate, sub_affiliate_name, dsp, status, registered_time, member_rank, last_login_time, first_deposit_amount, deposit, deposit_times, withdraw, withdraw_times'

type PeriodFilter =
  | { kind: 'exact'; period: string }
  | { kind: 'range'; from: string; to: string }

function applyPeriodFilter(query: any, filter?: PeriodFilter) {
  if (!filter) return query
  if (filter.kind === 'exact') return query.eq('period', filter.period)
  return query.gte('period', filter.from).lte('period', filter.to)
}

async function fetchAllMembers(partner?: string | null, columns = DEFAULT_COLUMNS, periodFilter?: PeriodFilter) {
  let query = supabase
    .from('members')
    .select(columns)
    .order('sub_affiliate', { ascending: true })
    .order('registered_time', { ascending: true })
  if (partner) query = query.eq('partner', partner)
  query = applyPeriodFilter(query, periodFilter)

  const allRows: any[] = []
  let start = 0
  const PAGE = 1000
  while (true) {
    const { data: page, error } = await query.range(start, start + PAGE - 1)
    if (error) throw error
    if (!page || page.length === 0) break
    allRows.push(...page)
    if (page.length < PAGE) break
    start += PAGE
  }
  return allRows
}

// "No period selected" means "current state of every member ever uploaded" —
// union across every period ever uploaded for a partner (including legacy
// period=NULL rows), keeping each username's most recently-periodned record.
// Uploads are often cohort-based (each period is that month's new
// registrants, not a full re-snapshot of everyone), so picking only the
// single latest period would silently drop every earlier cohort.
async function latestPerUsername(partnerVal: string, columns: string) {
  const columnsWithPeriod = columns.includes('period') ? columns : `${columns}, period`
  const rows = await fetchAllMembers(partnerVal, columnsWithPeriod)
  const latestByUsername = new Map<string, any>()
  for (const r of rows as any[]) {
    const existing = latestByUsername.get(r.username)
    if (!existing) { latestByUsername.set(r.username, r); continue }
    const rP: string | null = r.period ?? null
    const exP: string | null = existing.period ?? null
    // NULL period = legacy/unstamped data, always treated as older than any stamped period
    if (rP !== null && (exP === null || rP > exP)) latestByUsername.set(r.username, r)
  }
  return Array.from(latestByUsername.values())
}

async function fetchAllMembersLatestFallback(partner: string | null, columns: string) {
  if (partner) return latestPerUsername(partner, columns)

  const { data: partnersData } = await supabase.from('members').select('partner').not('partner', 'is', null)
  const partners = Array.from(new Set((partnersData || []).map((r: any) => r.partner as string)))
  if (partners.length === 0) return []
  const results = await Promise.all(partners.map((p) => latestPerUsername(p, columns)))
  return results.flat()
}

function buildSummary(rows: any[]) {
  let active = 0, locked = 0, disabled = 0
  for (const r of rows) {
    const s = (r.status || '').toLowerCase()
    if (s === 'active') active++
    else if (s === 'locked') locked++
    else if (s === 'disabled') disabled++
  }
  return { total: rows.length, active, locked, disabled }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const partner = searchParams.get('partner')
    const period = searchParams.get('period')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const top = searchParams.get('top')       // 'deposit' | 'ggr'
    const full = searchParams.get('full') === 'true'
    const summaryOnly = searchParams.get('summary') === 'true'

    let allRows: any[]
    if (period && period !== 'all') {
      allRows = await fetchAllMembers(partner, DEFAULT_COLUMNS, { kind: 'exact', period })
    } else if (from && to) {
      allRows = await fetchAllMembers(partner, DEFAULT_COLUMNS, { kind: 'range', from, to })
    } else {
      allRows = await fetchAllMembersLatestFallback(partner, DEFAULT_COLUMNS)
    }

    // Lightweight summary-only mode (for Dashboard)
    if (summaryOnly) {
      return NextResponse.json({ summary: buildSummary(allRows) })
    }

    // Top-50 mode (Dashboard); pass full=true for the complete sorted list, zero values excluded (Performance page)
    if (top === 'deposit') {
      let sorted = [...allRows].sort((a, b) => (b.deposit || 0) - (a.deposit || 0))
      if (full) sorted = sorted.filter(r => (r.deposit || 0) !== 0)
      else sorted = sorted.slice(0, 50)
      return NextResponse.json({ members: sorted })
    }
    if (top === 'ggr') {
      let sorted = [...allRows]
        .map(r => ({ ...r, ggr: (r.deposit || 0) - (r.withdraw || 0) }))
        .sort((a, b) => b.ggr - a.ggr)
      if (full) sorted = sorted.filter(r => r.ggr !== 0)
      else sorted = sorted.slice(0, 50)
      return NextResponse.json({ members: sorted })
    }

    return NextResponse.json({
      members: allRows,
      summary: buildSummary(allRows),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { records, period, period_type } = await request.json()
    if (!records || records.length === 0) {
      return NextResponse.json({ error: 'No records provided.' }, { status: 400 })
    }
    if (!period) {
      return NextResponse.json({ error: 'Period is required.' }, { status: 400 })
    }

    const partnerVal: string = records[0]?.partner || ''

    // Fetch existing rows across ALL periods for this partner, so the lock-to-first-upload
    // logic below can find each username's true earliest record, not just the last one fetched.
    const existingRows = await fetchAllMembers(
      partnerVal,
      'username, registered_time, first_deposit_amount, period'
    )
    const existingMap: Record<string, any> = {}
    for (const e of existingRows) {
      const current = existingMap[e.username]
      if (!current) { existingMap[e.username] = e; continue }
      const eTime = e.registered_time ? new Date(e.registered_time).getTime() : null
      const curTime = current.registered_time ? new Date(current.registered_time).getTime() : null
      if (eTime !== null && (curTime === null || eTime < curTime)) {
        existingMap[e.username] = e
      } else if (eTime === null && curTime === null) {
        const eP: string | null = e.period ?? null
        const curP: string | null = current.period ?? null
        if (eP !== null && (curP === null || eP < curP)) existingMap[e.username] = e
      }
    }

    // Replace all fields with the new upload's values, except registered_time/first_deposit_amount
    // which stay locked to the earliest-ever record for that username, and stamp period/period_type.
    const mergedRecords = records.map((r: any) => {
      const ex = existingMap[r.username]
      const base = ex
        ? {
            ...r,
            registered_time: ex.registered_time || r.registered_time,
            first_deposit_amount: ex.first_deposit_amount || r.first_deposit_amount,
          }
        : r
      return { ...base, period, period_type: period_type || null }
    })

    // Collapse duplicate (username, partner, period) rows within this same upload —
    // Postgres' ON CONFLICT DO UPDATE errors if a single statement would touch the
    // same target row twice. Last occurrence in the file wins.
    const dedupedMap = new Map<string, any>()
    for (const r of mergedRecords) {
      dedupedMap.set(`${r.username}|${r.partner}|${r.period}`, r)
    }
    const dedupedRecords = Array.from(dedupedMap.values())

    // Upsert deduped records in batches of 500
    const BATCH = 500
    let upserted = 0
    for (let i = 0; i < dedupedRecords.length; i += BATCH) {
      const batch = dedupedRecords.slice(i, i + BATCH)
      const { error } = await supabase
        .from('members')
        .upsert(batch, { onConflict: 'username,partner,period' })
      if (error) throw error
      upserted += batch.length
    }

    return NextResponse.json({ count: upserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
