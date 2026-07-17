import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess } from '@/lib/ops-access'
import { sendOpsTelegramMessage } from '@/lib/telegram-ops'

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

    for (const id of mentionedIds) {
      const mentioned = (profiles || []).find((p: any) => p.id === id)
      await sendOpsTelegramMessage(`🔔 <b>${mentioned?.name || mentioned?.username}</b> was mentioned on "${taskTitle}"`)
    }
  }

  await sendOpsTelegramMessage(`📋 New Update posted on "${taskTitle}"`)
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data, error }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from('ops_updates').select('*').eq('task_id', params.id).order('created_at', { ascending: false }),
    supabaseAdmin.from('profiles').select('id, username, name'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const usersById: Record<string, { id: string; username: string; name: string | null }> = {}
  for (const u of profiles || []) usersById[u.id] = u
  const updates = (data || []).map((u: any) => ({ ...u, author: usersById[u.user_id] || null }))

  return NextResponse.json({ updates })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { body, attachments } = await request.json()
  if (!body || !String(body).trim()) {
    return NextResponse.json({ error: 'Update body is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ops_updates')
    .insert({ task_id: params.id, user_id: auth.userId, body: String(body).trim(), attachments: attachments || [] })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyCollaboratorsAndMentions(params.id, auth.userId, String(body), 'update')

  return NextResponse.json({ id: data.id })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, body } = await request.json()
  if (!id || !body || !String(body).trim()) {
    return NextResponse.json({ error: 'Update id and body are required.' }, { status: 400 })
  }

  const { data: latest } = await supabaseAdmin
    .from('ops_updates')
    .select('id, user_id')
    .eq('task_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest || latest.id !== id) {
    return NextResponse.json({ error: 'Only the latest update can be edited.' }, { status: 400 })
  }
  if (latest.user_id !== auth.userId) {
    return NextResponse.json({ error: 'You can only edit your own update.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('ops_updates').update({ body: String(body).trim() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
