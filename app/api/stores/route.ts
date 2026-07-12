import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const partner = searchParams.get('partner')

  // Paginate to fetch every row regardless of dataset size — PostgREST caps
  // a single request at 1000 rows by default, and the directory now exceeds
  // that (1580+ stores for one partner alone).
  const allRows: any[] = []
  let start = 0
  const PAGE = 1000
  while (true) {
    let query = supabase.from('stores').select('*').order('store_name', { ascending: true })
    if (partner) query = query.eq('partner', partner)
    const { data: page, error } = await query.range(start, start + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!page || page.length === 0) break
    allRows.push(...page)
    if (page.length < PAGE) break
    start += PAGE
  }
  return NextResponse.json(allRows)
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, ...fields } = body
  const { data, error } = await supabase
    .from('stores')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
