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

    let query = supabase.from('members').select('sub_affiliate, sub_affiliate_name, status')
    if (partner) query = query.eq('partner', partner)

    // Paginate to get all rows
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

    // Aggregate by store
    const storeMap: Record<string, { sub_affiliate: string; sub_affiliate_name: string; total: number; active: number; locked: number; disabled: number }> = {}
    let totalActive = 0, totalLocked = 0, totalDisabled = 0

    for (const row of allRows) {
      const key = row.sub_affiliate
      if (!storeMap[key]) {
        storeMap[key] = { sub_affiliate: row.sub_affiliate, sub_affiliate_name: row.sub_affiliate_name, total: 0, active: 0, locked: 0, disabled: 0 }
      }
      storeMap[key].total++
      const s = (row.status || '').toLowerCase()
      if (s === 'active') { storeMap[key].active++; totalActive++ }
      else if (s === 'locked') { storeMap[key].locked++; totalLocked++ }
      else if (s === 'disabled') { storeMap[key].disabled++; totalDisabled++ }
    }

    const byStore = Object.values(storeMap).sort((a, b) => b.total - a.total)

    return NextResponse.json({
      byStore,
      summary: { total: allRows.length, active: totalActive, locked: totalLocked, disabled: totalDisabled },
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
