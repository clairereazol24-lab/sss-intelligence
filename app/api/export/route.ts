import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CSV_COLUMNS = [
  'sub_affiliate', 'store_name', 'period', 'period_type',
  'total_deposit', 'total_withdraw', 'valid_bet_amount', 'company_net_win',
  'payout_amount', 'total_promotion_amount', 'registered_members',
  'first_deposit_amount', 'first_deposit_count', 'deposit_member_count',
  'members_withdrawn', 'effective_member', 'partner', 'dsp',
] as const

function toCsv(rows: Record<string, any>[]) {
  const header = CSV_COLUMNS.join(',')
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((col) => {
      const value = row[col]
      if (value === null || value === undefined) return ''
      const str = String(value)
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
    }).join(',')
  )
  return [header, ...lines].join('\n')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const partner = searchParams.get('partner')

    let query = supabase.from('performance_data').select('*').order('period', { ascending: false })
    if (partner) query = query.eq('partner', partner)
    if (period && period !== 'all') {
      query = query.eq('period', period)
    } else if (from && to) {
      query = query.gte('period', from).lte('period', to)
    }

    const { data, error } = await query
    if (error) throw error

    const csv = toCsv(data || [])

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="performance_data.csv"',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
