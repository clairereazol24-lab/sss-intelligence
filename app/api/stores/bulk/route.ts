import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { stores, mode } = await request.json()

    if (!stores || !Array.isArray(stores) || stores.length === 0) {
      return NextResponse.json({ error: 'No stores provided' }, { status: 400 })
    }

    const uploadMode = mode === 'update' ? 'update' : 'new'

    const records = stores.map((s: any) => ({
      sub_affiliate: s.sub_affiliate,
      store_name: s.store_name,
      partner: s.partner || null,
      dsp: s.dsp || null,
      deployment_status: s.deployment_status || 'Not Deployed',
      updated_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from('stores')
      .upsert(records, { onConflict: 'sub_affiliate' })
      .select()

    if (error) throw error

    let removed = 0
    if (uploadMode === 'update') {
      const idList = records.map((r) => `"${r.sub_affiliate}"`).join(',')
      const { data: removedRows, error: deleteError } = await supabase
        .from('stores')
        .delete()
        .not('sub_affiliate', 'in', `(${idList})`)
        .select()

      if (deleteError) throw deleteError
      removed = removedRows?.length || 0
    }

    return NextResponse.json({ success: true, count: data?.length || 0, removed })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
