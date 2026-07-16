import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess } from '@/lib/ops-access'

async function fetchUsersById(userIds: string[]) {
  if (userIds.length === 0) return {}
  const { data } = await supabaseAdmin.from('profiles').select('id, username, name').in('id', Array.from(new Set(userIds)))
  const map: Record<string, { id: string; username: string; name: string | null }> = {}
  for (const u of data || []) map[u.id] = u
  return map
}

async function notifyCollaboratorsAndMentions(taskId: string, authorId: string, body: string, type: 'update' | 'comment') {
  const { data: task } = await supabaseAdmin.from('ops_tasks').select('title').eq('id', taskId).maybeSingle()
  const taskTitle = task?.title || 'a task'

  const { data: collabRows } = await supabaseAdmin.from('ops_collaborators').select('user_id').eq('task_id', taskId)
  const collaboratorIds = (collabRows || []).map((c: any) => c.user_id).filter((id: string) => id !== authorId)

  const noun = type === 'update' ? 'a new Update' : 'a new Comment'
  if (collaboratorIds.length > 0) {
    await supabaseAdmin.from('ops_notifications').insert(
      collaboratorIds.map((user_id: string) => ({
        user_id,
        task_id: taskId,
        type,
        body: `${noun} was posted on "${taskTitle}".`,
      }))
    )
  }

  const mentionMatches = Array.from(new Set((body.match(/@[A-Z]\w*/g) || []).map((m) => m.slice(1).toLowerCase())))
  if (mentionMatches.length > 0) {
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id, username, name')
    const mentionedIds = (profiles || [])
      .filter((p: any) => {
        const first = (p.name || '').split(' ')[0].toLowerCase()
        return mentionMatches.includes(first) || mentionMatches.includes((p.username || '').toLowerCase())
      })
      .map((p: any) => p.id)
      .filter((id: string) => id !== authorId)

    if (mentionedIds.length > 0) {
      await supabaseAdmin.from('ops_notifications').insert(
        mentionedIds.map((user_id: string) => ({
          user_id,
          task_id: taskId,
          type: 'mention',
          body: `You were mentioned on "${taskTitle}".`,
        }))
      )
    }
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('ops_comments')
    .select('*')
    .eq('task_id', params.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const usersById = await fetchUsersById((data || []).map((c: any) => c.user_id))
  const comments = (data || []).map((c: any) => ({ ...c, author: usersById[c.user_id] || null }))

  return NextResponse.json({ comments })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { body, attachments } = await request.json()
  if (!body || !String(body).trim()) {
    return NextResponse.json({ error: 'Comment body is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ops_comments')
    .insert({ task_id: params.id, user_id: auth.userId, body: String(body).trim(), attachments: attachments || [] })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyCollaboratorsAndMentions(params.id, auth.userId, String(body), 'comment')

  return NextResponse.json({ id: data.id })
}
