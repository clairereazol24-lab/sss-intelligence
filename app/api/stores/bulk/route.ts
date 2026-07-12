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
      // Full-replace semantics, but scoped per partner: "update" means "replace
      // the directory for whichever partner(s) this upload actually contains,"
      // never every partner in the table. An upload from a partner-scoped page
      // (e.g. Relevant Tech's Store Directory) must only ever touch Relevant
      // Tech's stores — it must not delete another partner's stores just
      // because they weren't in this file. Records with no partner at all
      // can't be safely scoped, so they're excluded from replace-cleanup
      // entirely (still upserted above, just never a basis for deletion).
      const partnersInUpload = Array.from(
        new Set(records.map((r) => r.partner).filter((p): p is string => !!p))
      )

      const PAGE = 1000
      const BATCH = 200
      for (const p of partnersInUpload) {
        const keepSet = new Set(records.filter((r) => r.partner === p).map((r) => r.sub_affiliate))

        const existingSubAffiliates: string[] = []
        let eStart = 0
        while (true) {
          const { data: page, error: fetchError } = await supabase
            .from('stores')
            .select('sub_affiliate')
            .eq('partner', p)
            .range(eStart, eStart + PAGE - 1)
          if (fetchError) throw fetchError
          if (!page || page.length === 0) break
          existingSubAffiliates.push(...page.map((r) => r.sub_affiliate as string))
          if (page.length < PAGE) break
          eStart += PAGE
        }
        const staleSubAffiliates = existingSubAffiliates.filter((s) => !keepSet.has(s))

        for (let i = 0; i < staleSubAffiliates.length; i += BATCH) {
          const batch = staleSubAffiliates.slice(i, i + BATCH)
          const { data: removedRows, error: deleteError } = await supabase
            .from('stores')
            .delete()
            .eq('partner', p)
            .in('sub_affiliate', batch)
            .select()
          if (deleteError) throw deleteError
          removed += removedRows?.length || 0
        }
      }
    }

    return NextResponse.json({ success: true, count: data?.length || 0, removed })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
