import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendOpsTelegramMessage } from '@/lib/telegram-ops'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ data: updates, error: updatesError }, { data: comments, error: commentsError }] = await Promise.all([
    supabaseAdmin.from('ops_updates').select('task_id, user_id, body, created_at').gte('created_at', since),
    supabaseAdmin.from('ops_comments').select('task_id, user_id, body, created_at').gte('created_at', since),
  ])
  if (updatesError) return NextResponse.json({ error: updatesError.message }, { status: 500 })
  if (commentsError) return NextResponse.json({ error: commentsError.message }, { status: 500 })

  const items = [
    ...(updates || []).map((u: any) => ({ ...u, type: 'update' as const })),
    ...(comments || []).map((c: any) => ({ ...c, type: 'comment' as const })),
  ]

  if (items.length === 0) {
    return NextResponse.json({ sent: false, reason: 'No activity in the last 24 hours.' })
  }

  const taskIds = Array.from(new Set(items.map((r) => r.task_id)))
  const userIds = Array.from(new Set(items.map((r) => r.user_id)))

  const [{ data: tasks }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from('ops_tasks').select('id, title').in('id', taskIds),
    supabaseAdmin.from('profiles').select('id, username, name').in('id', userIds),
  ])
  const titleById: Record<string, string> = {}
  for (const t of tasks || []) titleById[t.id] = t.title
  const nameById: Record<string, string> = {}
  for (const p of profiles || []) nameById[p.id] = p.name || p.username || 'Someone'

  const itemsByTask: Record<string, typeof items> = {}
  for (const item of items) {
    itemsByTask[item.task_id] = itemsByTask[item.task_id] || []
    itemsByTask[item.task_id].push(item)
  }

  const lines = ['📋 <b>Operations Daily Movement</b>']
  for (const [taskId, taskItems] of Object.entries(itemsByTask)) {
    taskItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    lines.push(`\n<b>${escapeHtml(titleById[taskId] || 'Unknown task')}</b>`)
    for (const item of taskItems) {
      const label = item.type === 'update' ? 'Update' : 'Comment'
      const author = escapeHtml(nameById[item.user_id] || 'Someone')
      const content = escapeHtml(truncate(item.body, 140))
      lines.push(`• ${label} by <b>${author}</b>: ${content}`)
    }
  }

  await sendOpsTelegramMessage(lines.join('\n'))

  return NextResponse.json({
    sent: true,
    taskCount: Object.keys(itemsByTask).length,
    updateCount: (updates || []).length,
    commentCount: (comments || []).length,
  })
}
