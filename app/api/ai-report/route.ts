import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Fingerprints the data the report is built from, so the cached report can be
// reused until a file/data upload actually changes something.
async function computeFingerprint() {
  const [perfCount, perfLatest, mktCount, mktLatest] = await Promise.all([
    supabase.from('performance_data').select('*', { count: 'exact', head: true }),
    supabase.from('performance_data').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    supabase.from('marketing_efforts').select('*', { count: 'exact', head: true }),
    supabase.from('marketing_efforts').select('created_at').order('created_at', { ascending: false }).limit(1),
  ])
  return {
    fingerprint: `${perfCount.count ?? 0}:${perfLatest.data?.[0]?.updated_at ?? ''}:${mktCount.count ?? 0}:${mktLatest.data?.[0]?.created_at ?? ''}`,
    hasData: (perfCount.count ?? 0) > 0,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'all'
    const { fingerprint, hasData } = await computeFingerprint()

    const { data: cached } = await supabase
      .from('ai_report_cache')
      .select('report_text, data_fingerprint')
      .eq('period', period)
      .maybeSingle()

    if (cached && cached.data_fingerprint === fingerprint) {
      return NextResponse.json({ cached: true, report: cached.report_text, hasData })
    }
    return NextResponse.json({ cached: false, hasData })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'AI Report generation is currently disabled.' }, { status: 503 })
}

async function generateReport(request: NextRequest) {
  try {
    const { performanceData, marketingData, period } = await request.json()
    const { fingerprint } = await computeFingerprint()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const totalDeposit = performanceData.reduce((s: number, r: any) => s + r.total_deposit, 0)
    const totalGGR = performanceData.reduce((s: number, r: any) => s + r.company_net_win, 0)
    const totalStores = performanceData.length
    const activeStores = performanceData.filter((r: any) => r.total_deposit > 0).length
    const zeroStores = performanceData.filter((r: any) => r.total_deposit === 0).length
    const negativeGGR = performanceData.filter((r: any) => r.company_net_win < 0)

    // Read attached marketing report files: PDFs are passed to Claude natively as
    // document blocks; DOCX files have their text extracted server-side since
    // Claude has no native DOCX reader.
    const pdfBlocks: any[] = []
    let docxText = ''
    const fileWarnings: string[] = []

    for (const m of marketingData || []) {
      if (!m.report_file_url) continue
      const label = `${m.store_name || m.sub_affiliate || 'Unknown store'} (${m.date})`
      try {
        const res = await fetch(m.report_file_url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buffer = Buffer.from(await res.arrayBuffer())

        if (m.report_file_type === 'pdf') {
          pdfBlocks.push({ type: 'text', text: `Attached report for ${label}:` })
          pdfBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
          })
        } else if (m.report_file_type === 'docx') {
          const { value } = await mammoth.extractRawText({ buffer })
          docxText += `\n\nATTACHED REPORT for ${label}:\n${value}`
        }
      } catch (err: any) {
        fileWarnings.push(`Note: could not read attached report for ${label} (${err.message})`)
      }
    }

    const prompt = `You are the LakiWin Store Intelligence Engine. Analyze the store performance data below and produce a structured intelligence report.

PERIOD: ${period}
TOTAL STORES: ${totalStores} | ACTIVE: ${activeStores} | ZERO ACTIVITY: ${zeroStores}
TOTAL DEPOSITS: ₱${totalDeposit.toLocaleString()} | TOTAL GGR: ₱${totalGGR.toLocaleString()}
NEGATIVE GGR STORES: ${negativeGGR.map((r: any) => r.store_name).join(', ') || 'None'}

PERFORMANCE DATA (JSON):
${JSON.stringify(performanceData, null, 2)}

${marketingData && marketingData.length > 0 ? `MARKETING EFFORTS DATA:
${JSON.stringify(marketingData, null, 2)}` : 'MARKETING EFFORTS: No data for this period.'}
${docxText}
${fileWarnings.length > 0 ? `\n\n${fileWarnings.join('\n')}` : ''}

Produce this exact structured report:

## 1. EXECUTIVE SUMMARY
Summarize system-wide status. Total GGR, total deposits, active vs inactive store ratio. Flag any critical issues.

## 2. FUNNEL ANALYSIS
Break down: Registered Members → First Deposit → Active Depositors → Effective Members.
Show conversion rates. Identify where members are dropping off.

## 3. KEY INSIGHTS
3-5 specific insights with store names and numbers. What is working, what is failing.

## 4. STORE SEGMENTATION

**SCALE (Top Performers):**
List stores with highest deposits + positive GGR. Include deposit amount and GGR.

**MAINTAIN (Mid Performers):**
Stores with moderate activity. Include what to watch.

**FIX (Underperformers):**
Stores with zero activity, negative GGR, or high withdrawals vs deposits. Be specific.

## 5. PARTNER ANALYSIS
Compare Relevant Tech vs Alpharus (if both present). Store count, total deposits, total GGR, avg per store.

## 6. MISSING ACTIONS
Flag specifically:
- Stores with registered members but ZERO deposits
- Stores with no activity entire period
- Stores where withdrawals significantly exceed deposits (ratio > 1.5x)
- Stores with high deposits but negative GGR

## 7. MARKETING EFFORT IMPACT
If marketing data exists: match booth activations to stores and show performance correlation.
If no data: note what marketing data would help here.

## 8. MARKETING SUGGESTIONS PER STORE
For each FIX store and selected MAINTAIN stores, give one specific actionable marketing suggestion. Format:
- [Store Name]: [Specific action]

## 9. RECOMMENDATIONS
**IMMEDIATE (0-7 days):** Top 3 actions
**MID-TERM (1-4 weeks):** Top 3 strategies
**SCALING:** Which stores to invest more in and why

RULES: Every insight must name specific stores. No generic advice. Flag suspicious patterns. Prioritize by GGR impact.`

    const content: any[] = [{ type: 'text', text: prompt }, ...pdfBlocks]

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        let fullText = ''
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        controller.close()
        await supabase
          .from('ai_report_cache')
          .upsert({ period, report_text: fullText, data_fingerprint: fingerprint, generated_at: new Date().toISOString() })
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
