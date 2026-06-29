import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const partner = searchParams.get('partner')
    const top = searchParams.get('top') // 'deposit' | 'ggr'

    let query = supabase
      .from('members')
      .select('username, sub_affiliate, sub_affiliate_name, dsp, status, registered_time, member_rank, last_login_time, first_deposit_amount, deposit, deposit_times, withdraw, withdraw_times')
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

    // Top-50 mode for Performance page
    if (top === 'deposit') {
      const sorted = [...allRows].sort((a, b) => (b.deposit || 0) - (a.deposit || 0)).slice(0, 50)
      return NextResponse.json({ members: sorted })
    }
    if (top === 'ggr') {
      const sorted = [...allRows]
        .map(r => ({ ...r, ggr: (r.deposit || 0) - (r.withdraw || 0) }))
        .sort((a, b) => b.ggr - a.ggr)
        .slice(0, 50)
      return NextResponse.json({ members: sorted })
    }

    let active = 0, locked = 0, disabled = 0
    for (const r of allRows) {
      const s = (r.status || '').toLowerCase()
      if (s === 'active') active++
      else if (s === 'locked') locked++
      else if (s === 'disabled') disabled++
    }

    return NextResponse.json({
      members: allRows,
      summary: { total: allRows.length, active, locked, disabled },
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

    // Upsert in batches of 500
    const BATCH = 500
    let upserted = 0
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH)
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
