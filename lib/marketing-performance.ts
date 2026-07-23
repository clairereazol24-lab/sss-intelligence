import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export type MarketingVisit = {
  id: string
  date_visit: string
  partner: string | null
  dsp: string | null
  sub_affiliate: string
  sub_affiliate_name: string | null
  marketing_type: 'Community' | 'Booth Activation'
  created_at: string
}

export type VisitMetrics = {
  before: { deposit: number; ggr: number; members: number }
  after: { deposit: number; ggr: number; members: number }
}

export type VisitWithMetrics = MarketingVisit & VisitMetrics

const PAGE = 1000

async function fetchAllPaginated<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = []
  let start = 0
  while (true) {
    const { data, error } = await build(start, start + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    start += PAGE
  }
  return rows
}

type PerfRow = { sub_affiliate: string; partner: string | null; period: string; total_deposit: number | null; company_net_win: number | null; registered_members: number | null }

/**
 * For each visit: "before" sums that store's performance_data strictly prior to
 * date_visit (the pre-visit baseline). "after" is the store's overall, all-time
 * total as of today (not just the post-visit increment) — so it always includes
 * everything in "before" plus everything since. Nothing is stored — it's all
 * recomputed from live data on every call, so "after" grows as new SSS Data is
 * uploaded. Members here means SSS Data's uploaded Registered Members count, not
 * the members table (which requires a separate per-username import and lags
 * behind what's actually on the CSV) — the CSV is the source of truth.
 */
export async function attachBeforeAfterMetrics(visits: MarketingVisit[]): Promise<VisitWithMetrics[]> {
  if (visits.length === 0) return []

  const subAffiliates = Array.from(new Set(visits.map(v => v.sub_affiliate)))

  const perfRows = await fetchAllPaginated<PerfRow>((from, to) =>
    supabase
      .from('performance_data')
      .select('sub_affiliate, partner, period, total_deposit, company_net_win, registered_members')
      .in('sub_affiliate', subAffiliates)
      .order('id', { ascending: true })
      .range(from, to)
  )

  return visits.map(visit => {
    const sameStore = (subAffiliate: string, partner: string | null) =>
      subAffiliate === visit.sub_affiliate && (partner ?? '') === (visit.partner ?? '')

    let beforeDeposit = 0, beforeGGR = 0, beforeMembers = 0, afterDeposit = 0, afterGGR = 0, afterMembers = 0
    for (const row of perfRows) {
      if (!sameStore(row.sub_affiliate, row.partner)) continue
      afterDeposit += row.total_deposit || 0
      afterGGR += row.company_net_win || 0
      afterMembers += row.registered_members || 0
      if (row.period < visit.date_visit) {
        beforeDeposit += row.total_deposit || 0
        beforeGGR += row.company_net_win || 0
        beforeMembers += row.registered_members || 0
      }
    }

    return {
      ...visit,
      before: { deposit: beforeDeposit, ggr: beforeGGR, members: beforeMembers },
      after: { deposit: afterDeposit, ggr: afterGGR, members: afterMembers },
    }
  })
}
