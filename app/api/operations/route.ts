import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess, requireOpsAdmin } from '@/lib/ops-access'

export async function GET() {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: tasks, error } = await supabaseAdmin
    .from('ops_tasks')
    .select('*')
    .order('is_special', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const taskIds = (tasks || []).map((t: any) => t.id)

  const [{ data: collabRows }, { data: commentRows }, { data: notifRows }] = await Promise.all([
    supabaseAdmin.from('ops_collaborators').select('task_id').in('task_id', taskIds),
    supabaseAdmin.from('ops_comments').select('task_id').in('task_id', taskIds),
    supabaseAdmin
      .from('ops_notifications')
      .select('task_id')
      .in('task_id', taskIds)
      .eq('user_id', auth.userId)
      .eq('is_read', false)
      .in('type', ['update', 'comment']),
  ])

  const countBy = (rows: any[] | null) => {
    const map: Record<string, number> = {}
    for (const r of rows || []) map[r.task_id] = (map[r.task_id] || 0) + 1
    return map
  }
  const collabCounts = countBy(collabRows)
  const commentCounts = countBy(commentRows)
  const unreadCounts = countBy(notifRows)

  const result = (tasks || []).map((t: any) => ({
    ...t,
    collaborator_count: collabCounts[t.id] || 0,
    comment_count: commentCounts[t.id] || 0,
    unread_count: unreadCounts[t.id] || 0,
  }))

  return NextResponse.json({ tasks: result, isAdmin: auth.access.role === 'admin' })
}

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { title, description, priority, deadline } = await request.json()
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ops_tasks')
    .insert({
      title: String(title).trim(),
      description: description || null,
      priority: priority || 'medium',
      deadline: deadline || null,
      is_special: true,
      created_by: auth.userId,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('ops_activity_log').insert({
    task_id: data.id,
    user_id: auth.userId,
    action_text: 'created this task',
  })

  return NextResponse.json({ id: data.id })
}
