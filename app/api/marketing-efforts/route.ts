import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { attachBeforeAfterMetrics, type MarketingVisit } from '@/lib/marketing-performance'
import { requireMarketingAccess } from '@/lib/marketing-access'

const PAGE = 1000

export async function GET() {
  const auth = await requireMarketingAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows: MarketingVisit[] = []
  let start = 0
  while (true) {
    const { data, error } = await supabase
      .from('marketing_efforts')
      .select('id, date_visit, partner, dsp, sub_affiliate, sub_affiliate_name, marketing_type, created_at')
      .order('date_visit', { ascending: false })
      .range(start, start + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    rows.push(...(data as MarketingVisit[]))
    if (data.length < PAGE) break
    start += PAGE
  }

  try {
    const withMetrics = await attachBeforeAfterMetrics(rows)
    return NextResponse.json(withMetrics)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireMarketingAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { date_visit, partner, dsp, sub_affiliate, sub_affiliate_name, marketing_type } = body

  if (!sub_affiliate || !marketing_type || !date_visit) {
    return NextResponse.json({ error: 'sub_affiliate, marketing_type, and date_visit are required.' }, { status: 400 })
  }
  if (marketing_type !== 'Community' && marketing_type !== 'Booth Activation') {
    return NextResponse.json({ error: 'marketing_type must be Community or Booth Activation.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('marketing_efforts')
    .insert({
      date_visit,
      partner: partner ?? null,
      dsp: dsp ?? null,
      sub_affiliate,
      sub_affiliate_name: sub_affiliate_name ?? null,
      marketing_type,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
