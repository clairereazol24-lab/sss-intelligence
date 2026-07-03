import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

async function fetchAllMembers(partner?: string | null, columns = 'username, sub_affiliate, sub_affiliate_name, dsp, status, registered_time, member_rank, last_login_time, first_deposit_amount, deposit, deposit_times, withdraw, withdraw_times') {
  let query = supabase
    .from('members')
    .select(columns)
    .order('sub_affiliate', { ascending: true })
    .order('registered_time', { ascending: true })
  if (partner) query = query.eq('partner', partner)

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
    const top = searchParams.get('top')       // 'deposit' | 'ggr'
    const full = searchParams.get('full') === 'true'
    const summaryOnly = searchParams.get('summary') === 'true'

    const allRows = await fetchAllMembers(partner)

    // Lightweight summary-only mode (for Dashboard)
    if (summaryOnly) {
      return NextResponse.json({ summary: buildSummary(allRows) })
    }

    // Top-50 mode (Dashboard); pass full=true for the complete sorted list (Performance page)
    if (top === 'deposit') {
      let sorted = [...allRows].sort((a, b) => (b.deposit || 0) - (a.deposit || 0))
      if (!full) sorted = sorted.slice(0, 50)
      return NextResponse.json({ members: sorted })
    }
    if (top === 'ggr') {
      let sorted = [...allRows]
        .map(r => ({ ...r, ggr: (r.deposit || 0) - (r.withdraw || 0) }))
        .sort((a, b) => b.ggr - a.ggr)
      if (!full) sorted = sorted.slice(0, 50)
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
    const { records } = await request.json()
    if (!records || records.length === 0) {
      return NextResponse.json({ error: 'No records provided.' }, { status: 400 })
    }

    const partnerVal: string = records[0]?.partner || ''

    // Fetch existing registered_time/first_deposit_amount so those stay locked to the first upload
    const existingRows = await fetchAllMembers(
      partnerVal,
      'username, registered_time, first_deposit_amount'
    )
    const existingMap: Record<string, any> = {}
    for (const e of existingRows) existingMap[e.username] = e

    // Replace all fields with the new upload's values, except registered_time/first_deposit_amount which stay locked to the first-ever record
    const mergedRecords = records.map((r: any) => {
      const ex = existingMap[r.username]
      if (ex) {
        return {
          ...r,
          registered_time: ex.registered_time || r.registered_time,
          first_deposit_amount: ex.first_deposit_amount || r.first_deposit_amount,
        }
      }
      return r
    })

    // Upsert merged records in batches of 500
    const BATCH = 500
    let upserted = 0
    for (let i = 0; i < mergedRecords.length; i += BATCH) {
      const batch = mergedRecords.slice(i, i + BATCH)
      const { error } = await supabase
        .from('members')
        .upsert(batch, { onConflict: 'username,partner' })
      if (error) throw error
      upserted += batch.length
    }

    return NextResponse.json({ count: upserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
