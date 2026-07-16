import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOpsAccess, requireOpsAdmin } from '@/lib/ops-access'

async function fetchUsersById(userIds: string[]) {
  if (userIds.length === 0) return {}
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, username, name')
    .in('id', Array.from(new Set(userIds)))
  const map: Record<string, { id: string; username: string; name: string | null }> = {}
  for (const u of data || []) map[u.id] = u
  return map
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: task, error: taskError }, { data: links }, { data: collabRows }, { data: activity }] =
    await Promise.all([
      supabaseAdmin.from('ops_tasks').select('*').eq('id', params.id).maybeSingle(),
      supabaseAdmin.from('ops_reference_links').select('*').eq('task_id', params.id).order('sort_order'),
      supabaseAdmin.from('ops_collaborators').select('user_id').eq('task_id', params.id),
      supabaseAdmin.from('ops_activity_log').select('*').eq('task_id', params.id).order('created_at', { ascending: false }),
    ])
  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 })
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })

  const userIds = [...(collabRows || []).map((c: any) => c.user_id), ...(activity || []).map((a: any) => a.user_id)]
  const usersById = await fetchUsersById(userIds)

  const collaborators = (collabRows || []).map((c: any) => usersById[c.user_id]).filter(Boolean)
  const activity_log = (activity || []).map((a: any) => ({ ...a, author: usersById[a.user_id] || null }))

  return NextResponse.json({ task, reference_links: links || [], collaborators, activity_log, isAdmin: auth.access.role === 'admin' })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('ops_tasks')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })

  const body = await request.json()
  const { title, description, priority, is_archived, reference_links, collaborator_ids } = body
  // Empty string means "cleared" in the edit form's date input — normalize to null
  // before it ever reaches the DATE column, otherwise Postgres rejects '' as an invalid date.
  const deadline = body.deadline === undefined ? undefined : (body.deadline || null)

  if (is_archived === true && !existing.is_special) {
    return NextResponse.json({ error: 'Only Special Tasks can be archived.' }, { status: 400 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('ops_tasks')
    .update({
      title: title ?? existing.title,
      description: description ?? existing.description,
      priority: priority ?? existing.priority,
      deadline: deadline === undefined ? existing.deadline : deadline,
      is_archived: is_archived === undefined ? existing.is_archived : is_archived,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const activityEntries: { task_id: string; user_id: string; action_text: string }[] = []
  if (priority !== undefined && priority !== existing.priority) {
    activityEntries.push({ task_id: params.id, user_id: auth.userId, action_text: `updated Priority to ${priority}` })
  }
  if (deadline !== undefined && deadline !== existing.deadline) {
    activityEntries.push({
      task_id: params.id,
      user_id: auth.userId,
      action_text: deadline ? `set Deadline to ${deadline}` : 'removed the Deadline',
    })
  }
  if (is_archived !== undefined && is_archived !== existing.is_archived) {
    activityEntries.push({
      task_id: params.id,
      user_id: auth.userId,
      action_text: is_archived ? 'archived this task' : 'restored this task from archive',
    })
  }

  if (Array.isArray(reference_links)) {
    await supabaseAdmin.from('ops_reference_links').delete().eq('task_id', params.id)
    if (reference_links.length > 0) {
      await supabaseAdmin.from('ops_reference_links').insert(
        reference_links.map((l: { label: string; url: string }, i: number) => ({
          task_id: params.id,
          label: l.label,
          url: l.url,
          sort_order: i,
        }))
      )
    }
    activityEntries.push({ task_id: params.id, user_id: auth.userId, action_text: 'updated Reference Links' })
  }

  if (Array.isArray(collaborator_ids)) {
    const { data: currentCollabs } = await supabaseAdmin
      .from('ops_collaborators')
      .select('user_id')
      .eq('task_id', params.id)
    const currentIds = new Set((currentCollabs || []).map((c: any) => c.user_id))
    const newIds = new Set(collaborator_ids as string[])
    const changed = currentIds.size !== newIds.size || Array.from(currentIds).some((id) => !newIds.has(id))

    if (changed) {
      await supabaseAdmin.from('ops_collaborators').delete().eq('task_id', params.id)
      if (newIds.size > 0) {
        await supabaseAdmin
          .from('ops_collaborators')
          .insert(Array.from(newIds).map((user_id) => ({ task_id: params.id, user_id })))
      }
      activityEntries.push({ task_id: params.id, user_id: auth.userId, action_text: 'updated Collaborators' })
    }
  }

  if (activityEntries.length > 0) {
    await supabaseAdmin.from('ops_activity_log').insert(activityEntries)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOpsAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: existing } = await supabaseAdmin.from('ops_tasks').select('is_special').eq('id', params.id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  if (!existing.is_special) {
    return NextResponse.json({ error: 'Permanent tasks cannot be deleted.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('ops_tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
