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

type PerfRow = { sub_affiliate: string; partner: string | null; period: string; total_deposit: number | null; company_net_win: number | null }
type MemberRow = { username: string; sub_affiliate: string; partner: string | null; registered_time: string | null }

/**
 * For each visit: "before" sums that store's performance_data/members strictly
 * prior to date_visit (the pre-visit baseline). "after" is the store's overall,
 * all-time total as of today (not just the post-visit increment) — so it always
 * includes everything in "before" plus everything since. Neither is stored — both
 * are recomputed from live data on every call, so "after" grows as new SSS Data
 * is uploaded.
 */
export async function attachBeforeAfterMetrics(visits: MarketingVisit[]): Promise<VisitWithMetrics[]> {
  if (visits.length === 0) return []

  const subAffiliates = Array.from(new Set(visits.map(v => v.sub_affiliate)))

  const perfRows = await fetchAllPaginated<PerfRow>((from, to) =>
    supabase
      .from('performance_data')
      .select('sub_affiliate, partner, period, total_deposit, company_net_win')
      .in('sub_affiliate', subAffiliates)
      .order('id', { ascending: true })
      .range(from, to)
  )

  const memberRows = await fetchAllPaginated<MemberRow>((from, to) =>
    supabase
      .from('members')
      .select('username, sub_affiliate, partner, registered_time')
      .in('sub_affiliate', subAffiliates)
      .order('id', { ascending: true })
      .range(from, to)
  )

  // Dedupe members by username+partner, keeping the earliest registered_time seen.
  // registered_time is locked to the earliest-ever record per username on import
  // (see Members module notes), so every row for a username should already carry
  // it — this min-keep is a defensive guard, not the primary mechanism.
  const memberByUsername = new Map<string, MemberRow>()
  for (const m of memberRows) {
    const key = `${m.username}__${m.partner ?? ''}`
    const existing = memberByUsername.get(key)
    if (!existing) { memberByUsername.set(key, m); continue }
    const eTime = existing.registered_time ? new Date(existing.registered_time).getTime() : null
    const mTime = m.registered_time ? new Date(m.registered_time).getTime() : null
    if (mTime !== null && (eTime === null || mTime < eTime)) memberByUsername.set(key, m)
  }
  const dedupedMembers = Array.from(memberByUsername.values())

  return visits.map(visit => {
    const sameStore = (subAffiliate: string, partner: string | null) =>
      subAffiliate === visit.sub_affiliate && (partner ?? '') === (visit.partner ?? '')

    let beforeDeposit = 0, beforeGGR = 0, afterDeposit = 0, afterGGR = 0
    for (const row of perfRows) {
      if (!sameStore(row.sub_affiliate, row.partner)) continue
      afterDeposit += row.total_deposit || 0
      afterGGR += row.company_net_win || 0
      if (row.period < visit.date_visit) {
        beforeDeposit += row.total_deposit || 0
        beforeGGR += row.company_net_win || 0
      }
    }

    let beforeMembers = 0, afterMembers = 0
    for (const m of dedupedMembers) {
      if (!sameStore(m.sub_affiliate, m.partner)) continue
      afterMembers++
      if (m.registered_time && m.registered_time.slice(0, 10) < visit.date_visit) beforeMembers++
    }

    return {
      ...visit,
      before: { deposit: beforeDeposit, ggr: beforeGGR, members: beforeMembers },
      after: { deposit: afterDeposit, ggr: afterGGR, members: afterMembers },
    }
  })
}
