import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

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
      // Delete every store not in this upload (full-replace semantics). A single
      // .not('sub_affiliate', 'in', <one giant list>) call builds a URL-encoded
      // filter that blows past request-size limits once the directory is
      // realistically sized (1000+ stores) and fails with a bare "Bad Request" —
      // so diff in memory and delete the stale set in small batches instead.
      const keepSet = new Set(records.map((r) => r.sub_affiliate))
      const existingSubAffiliates: string[] = []
      let eStart = 0
      const PAGE = 1000
      while (true) {
        const { data: page, error: fetchError } = await supabase
          .from('stores')
          .select('sub_affiliate')
          .range(eStart, eStart + PAGE - 1)
        if (fetchError) throw fetchError
        if (!page || page.length === 0) break
        existingSubAffiliates.push(...page.map((r) => r.sub_affiliate as string))
        if (page.length < PAGE) break
        eStart += PAGE
      }
      const staleSubAffiliates = existingSubAffiliates.filter((s) => !keepSet.has(s))

      const BATCH = 200
      for (let i = 0; i < staleSubAffiliates.length; i += BATCH) {
        const batch = staleSubAffiliates.slice(i, i + BATCH)
        const { data: removedRows, error: deleteError } = await supabase
          .from('stores')
          .delete()
          .in('sub_affiliate', batch)
          .select()
        if (deleteError) throw deleteError
        removed += removedRows?.length || 0
      }
    }

    return NextResponse.json({ success: true, count: data?.length || 0, removed })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
