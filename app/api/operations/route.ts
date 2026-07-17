import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess, requireOpsAdmin } from '@/lib/ops-access'
import { fetchOpsTaskList } from '@/lib/ops-tasks'

export async function GET() {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tasks = await fetchOpsTaskList(auth)

  return NextResponse.json({ tasks, isAdmin: auth.access.role === 'admin' })
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
