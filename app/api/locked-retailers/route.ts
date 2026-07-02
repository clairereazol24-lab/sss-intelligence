import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

type StoreTotals = {
  sub_affiliate: string
  store_name: string
  partner: string | null
  dsp: string | null
  total_deposit: number
  total_withdraw: number
  valid_bet_amount: number
  company_net_win: number
  payout_amount: number
  registered_members: number
  deposit_member_count: number
  effective_member: number
}

const emptyTotals = (sub_affiliate: string, store_name: string, partner: string | null, dsp: string | null): StoreTotals => ({
  sub_affiliate,
  store_name,
  partner,
  dsp,
  total_deposit: 0,
  total_withdraw: 0,
  valid_bet_amount: 0,
  company_net_win: 0,
  payout_amount: 0,
  registered_members: 0,
  deposit_member_count: 0,
  effective_member: 0,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rawIds: unknown = body?.subAffiliateIds
    const ids = Array.from(
      new Set(
        (Array.isArray(rawIds) ? rawIds : [])
          .map((id) => String(id).trim())
          .filter((id) => id.length > 0)
      )
    )

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No Sub Affiliate IDs provided.' }, { status: 400 })
    }

    // Paginate performance_data for the requested IDs (same pagination pattern as app/api/performance/route.ts)
    const allData: any[] = []
    let start = 0
    const PAGE = 1000
    while (true) {
      const { data: page, error } = await supabase
        .from('performance_data')
        .select(
          'sub_affiliate, store_name, partner, dsp, total_deposit, total_withdraw, valid_bet_amount, company_net_win, payout_amount, registered_members, deposit_member_count, effective_member'
        )
        .in('sub_affiliate', ids)
        .range(start, start + PAGE - 1)
      if (error) throw error
      if (!page || page.length === 0) break
      allData.push(...page)
      if (page.length < PAGE) break
      start += PAGE
    }

    // Aggregate all-time totals per sub_affiliate
    const storeMap: Record<string, StoreTotals> = {}
    for (const row of allData) {
      const key = row.sub_affiliate
      if (!storeMap[key]) {
        storeMap[key] = emptyTotals(row.sub_affiliate, row.store_name, row.partner, row.dsp)
      }
      const s = storeMap[key]
      s.total_deposit += row.total_deposit ?? 0
      s.total_withdraw += row.total_withdraw ?? 0
      s.valid_bet_amount += row.valid_bet_amount ?? 0
      s.company_net_win += row.company_net_win ?? 0
      s.payout_amount += row.payout_amount ?? 0
      s.registered_members += row.registered_members ?? 0
      s.deposit_member_count += row.deposit_member_count ?? 0
      s.effective_member += row.effective_member ?? 0
    }

    // Fall back to the stores directory for IDs with no performance_data rows
    const missingIds = ids.filter((id) => !storeMap[id])
    if (missingIds.length > 0) {
      const { data: dirStores, error: dirError } = await supabase
        .from('stores')
        .select('sub_affiliate, store_name, partner, dsp')
        .in('sub_affiliate', missingIds)
      if (dirError) throw dirError
      for (const ds of dirStores || []) {
        storeMap[ds.sub_affiliate] = emptyTotals(ds.sub_affiliate, ds.store_name, ds.partner, ds.dsp)
      }
    }

    const matched = Object.values(storeMap).sort((a, b) => b.total_deposit - a.total_deposit)
    const notFound = ids.filter((id) => !storeMap[id])

    // DSP rollup
    const dspMap: Record<
      string,
      { dsp: string; retailer_count: number; total_deposit: number; valid_bet_amount: number; company_net_win: number }
    > = {}
    for (const s of matched) {
      const key = s.dsp || 'Unknown'
      if (!dspMap[key]) {
        dspMap[key] = { dsp: key, retailer_count: 0, total_deposit: 0, valid_bet_amount: 0, company_net_win: 0 }
      }
      dspMap[key].retailer_count += 1
      dspMap[key].total_deposit += s.total_deposit
      dspMap[key].valid_bet_amount += s.valid_bet_amount
      dspMap[key].company_net_win += s.company_net_win
    }
    const dspSummary = Object.values(dspMap).sort((a, b) => b.total_deposit - a.total_deposit)

    // Build the 3-sheet workbook
    const wb = XLSX.utils.book_new()

    const ws1 = XLSX.utils.aoa_to_sheet([
      [
        'Sub Affiliate', 'Store Name', 'Partner', 'DSP', 'Total Deposit', 'Total Withdraw',
        'Valid Bet Amount', 'Company Net Win (GGR)', 'Payout Amount', 'Registered Members',
        'Deposit Member Count', 'Effective Member',
      ],
      ...matched.map((s) => [
        s.sub_affiliate, s.store_name, s.partner ?? '', s.dsp ?? '',
        s.total_deposit, s.total_withdraw, s.valid_bet_amount, s.company_net_win,
        s.payout_amount, s.registered_members, s.deposit_member_count, s.effective_member,
      ]),
    ])
    XLSX.utils.book_append_sheet(wb, ws1, 'Locked Retailers')

    const ws2 = XLSX.utils.aoa_to_sheet([
      ['DSP', 'Locked Retailer Count', 'Total Deposit', 'Valid Bet Amount', 'Company Net Win (GGR)'],
      ...dspSummary.map((d) => [d.dsp, d.retailer_count, d.total_deposit, d.valid_bet_amount, d.company_net_win]),
    ])
    XLSX.utils.book_append_sheet(wb, ws2, 'DSP Summary')

    const ws3 = XLSX.utils.aoa_to_sheet([['Sub Affiliate'], ...notFound.map((id) => [id])])
    XLSX.utils.book_append_sheet(wb, ws3, 'Not Found')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const today = new Date().toISOString().slice(0, 10)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="locked-retailers-${today}.xlsx"`,
        'X-Matched-Count': String(matched.length),
        'X-Not-Found-Count': String(notFound.length),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate report.' }, { status: 500 })
  }
}
