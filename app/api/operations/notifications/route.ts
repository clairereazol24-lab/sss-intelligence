import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess } from '@/lib/ops-access'

export async function GET() {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('ops_notifications')
    .select('*')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const taskIds = Array.from(new Set((data || []).map((n: any) => n.task_id)))
  const { data: tasks } = await supabaseAdmin.from('ops_tasks').select('id, title').in('id', taskIds)
  const titleById: Record<string, string> = {}
  for (const t of tasks || []) titleById[t.id] = t.title

  const notifications = (data || []).map((n: any) => ({ ...n, task_title: titleById[n.task_id] || 'Unknown task' }))

  return NextResponse.json({ notifications })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, markAllRead } = await request.json()

  if (markAllRead) {
    const { error } = await supabaseAdmin.from('ops_notifications').update({ is_read: true }).eq('user_id', auth.userId).eq('is_read', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (!id) return NextResponse.json({ error: 'id or markAllRead is required.' }, { status: 400 })

  const { error } = await supabaseAdmin.from('ops_notifications').update({ is_read: true }).eq('id', id).eq('user_id', auth.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
