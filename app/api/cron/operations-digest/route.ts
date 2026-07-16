import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendOpsTelegramMessage } from '@/lib/telegram-ops'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ data: updates, error: updatesError }, { data: comments, error: commentsError }] = await Promise.all([
    supabaseAdmin.from('ops_updates').select('task_id, created_at').gte('created_at', since),
    supabaseAdmin.from('ops_comments').select('task_id, created_at').gte('created_at', since),
  ])
  if (updatesError) return NextResponse.json({ error: updatesError.message }, { status: 500 })
  if (commentsError) return NextResponse.json({ error: commentsError.message }, { status: 500 })

  if ((updates || []).length === 0 && (comments || []).length === 0) {
    return NextResponse.json({ sent: false, reason: 'No activity in the last 24 hours.' })
  }

  const taskIds = Array.from(new Set([...(updates || []), ...(comments || [])].map((r: any) => r.task_id)))
  const { data: tasks } = await supabaseAdmin.from('ops_tasks').select('id, title').in('id', taskIds)
  const titleById: Record<string, string> = {}
  for (const t of tasks || []) titleById[t.id] = t.title

  const countsByTask: Record<string, { updates: number; comments: number }> = {}
  for (const u of updates || []) {
    countsByTask[u.task_id] = countsByTask[u.task_id] || { updates: 0, comments: 0 }
    countsByTask[u.task_id].updates += 1
  }
  for (const c of comments || []) {
    countsByTask[c.task_id] = countsByTask[c.task_id] || { updates: 0, comments: 0 }
    countsByTask[c.task_id].comments += 1
  }

  const lines = ['📋 <b>Operations Daily Movement</b>']
  for (const [taskId, counts] of Object.entries(countsByTask)) {
    const parts: string[] = []
    if (counts.updates > 0) parts.push(`${counts.updates} update${counts.updates === 1 ? '' : 's'}`)
    if (counts.comments > 0) parts.push(`${counts.comments} comment${counts.comments === 1 ? '' : 's'}`)
    lines.push(`• ${titleById[taskId] || 'Unknown task'} — ${parts.join(', ')}`)
  }

  await sendOpsTelegramMessage(lines.join('\n'))

  return NextResponse.json({
    sent: true,
    taskCount: Object.keys(countsByTask).length,
    updateCount: (updates || []).length,
    commentCount: (comments || []).length,
  })
}
