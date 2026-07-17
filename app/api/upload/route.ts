import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getUserAccess, DATA_IMPORT_ALLOWED_USERNAME } from '@/lib/auth'

async function requireImportAccess() {
  const server = createServerClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return false
  const access = await getUserAccess(supabase, user.id)
  return access?.username === DATA_IMPORT_ALLOWED_USERNAME
}

export async function DELETE(_request: NextRequest) {
  if (!(await requireImportAccess())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Find the most recent updated_at across all rows (the last upload batch)
    const { data: latest, error: findError } = await supabase
      .from('performance_data')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (findError || !latest) {
      return NextResponse.json({ error: 'No data to undo.' }, { status: 404 })
    }

    const { count, error: delError } = await supabase
      .from('performance_data')
      .delete({ count: 'exact' })
      .eq('updated_at', latest.updated_at)

    if (delError) throw delError

    return NextResponse.json({ success: true, deleted: count })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireImportAccess())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { records, period, periodType, mode = 'new' } = await request.json()

    if (!records || !period || !periodType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (records.length === 0) {
      return NextResponse.json({ error: 'Cannot upload an empty file.' }, { status: 400 })
    }

    const partnerSet = new Set<string | null>(records.map((r: any) => r.partner || null))
    const uniquePartners: (string | null)[] = Array.from(partnerSet)

    if (mode === 'new') {
      // Block if any period+partner combo already exists
      let existsCount = 0
      for (const p of uniquePartners) {
        const q = supabase
          .from('performance_data')
          .select('*', { count: 'exact', head: true })
          .eq('period', period)
        const { count } = await (p === null ? q.is('partner', null) : q.eq('partner', p))
        existsCount += count || 0
      }
      if (existsCount > 0) {
        return NextResponse.json(
          { error: `Data for ${period} already exists. Use "Update File" mode to replace it.` },
          { status: 409 }
        )
      }
    }

    if (mode === 'update') {
      // Delete existing rows for this period+partner before re-inserting
      for (const p of uniquePartners) {
        const q = supabase.from('performance_data').delete().eq('period', period)
        const { error: delError } = await (p === null ? q.is('partner', null) : q.eq('partner', p))
        if (delError) throw delError
      }
    }

    // Auto-upsert stores master table
    const storeUpserts = records.map((r: any) => ({
      sub_affiliate: r.sub_affiliate,
      store_name: r.store_name,
      partner: r.partner || null,
      dsp: r.dsp || null,
      updated_at: new Date().toISOString(),
    }))

    await supabase
      .from('stores')
      .upsert(storeUpserts, { onConflict: 'sub_affiliate,partner', ignoreDuplicates: false })

    const perfRecords = records.map((r: any) => ({
      sub_affiliate: r.sub_affiliate,
      store_name: r.store_name,
      period,
      period_type: periodType,
      total_deposit: Math.max(0, parseFloat(r.total_deposit) || 0),
      total_withdraw: parseFloat(r.total_withdraw) || 0,
      valid_bet_amount: parseFloat(r.valid_bet_amount) || 0,
      company_net_win: parseFloat(r.company_net_win) || 0,
      payout_amount: parseFloat(r.payout_amount) || 0,
      total_promotion_amount: parseFloat(r.total_promotion_amount) || 0,
      registered_members: Math.max(0, parseInt(r.registered_members) || 0),
      first_deposit_amount: parseFloat(r.first_deposit_amount) || 0,
      first_deposit_count: parseInt(r.first_deposit_count) || 0,
      deposit_member_count: parseInt(r.deposit_member_count) || 0,
      members_withdrawn: parseInt(r.members_withdrawn) || 0,
      effective_member: parseInt(r.effective_member) || 0,
      partner: r.partner || null,
      dsp: r.dsp || null,
      updated_at: new Date().toISOString(),
    }))

    // Deduplicate within the file by (sub_affiliate, partner) — keep last row per store
    const dedupMap = new Map<string, any>()
    for (const r of perfRecords) dedupMap.set(`${r.sub_affiliate}__${r.partner ?? ''}`, r)
    const dedupedRecords = Array.from(dedupMap.values())

    const { error } = await supabase.from('performance_data').insert(dedupedRecords)
    if (error) throw error

    return NextResponse.json({ success: true, count: dedupedRecords.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
