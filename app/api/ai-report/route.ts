import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { performanceData, marketingData, period } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const totalDeposit = performanceData.reduce((s: number, r: any) => s + r.total_deposit, 0)
    const totalGGR = performanceData.reduce((s: number, r: any) => s + r.company_net_win, 0)
    const totalStores = performanceData.length
    const activeStores = performanceData.filter((r: any) => r.total_deposit > 0).length
    const zeroStores = performanceData.filter((r: any) => r.total_deposit === 0).length
    const negativeGGR = performanceData.filter((r: any) => r.company_net_win < 0)

    const prompt = `You are the LakiWin Store Intelligence Engine. Analyze the store performance data below and produce a structured intelligence report.

PERIOD: ${period}
TOTAL STORES: ${totalStores} | ACTIVE: ${activeStores} | ZERO ACTIVITY: ${zeroStores}
TOTAL DEPOSITS: ₱${totalDeposit.toLocaleString()} | TOTAL GGR: ₱${totalGGR.toLocaleString()}
NEGATIVE GGR STORES: ${negativeGGR.map((r: any) => r.store_name).join(', ') || 'None'}

PERFORMANCE DATA (JSON):
${JSON.stringify(performanceData, null, 2)}

${marketingData && marketingData.length > 0 ? `MARKETING EFFORTS DATA:
${JSON.stringify(marketingData, null, 2)}` : 'MARKETING EFFORTS: No data for this period.'}

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

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
