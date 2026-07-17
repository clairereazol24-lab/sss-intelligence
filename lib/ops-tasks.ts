import { supabaseAdmin } from '@/lib/supabase-admin'
import type { OpsAccess } from '@/lib/ops-access'
import type { OpsTask } from '@/lib/supabase'

export type OpsBoardTask = OpsTask & { collaborator_count: number; comment_count: number; unread_count: number }

export async function fetchOpsTaskList(auth: OpsAccess): Promise<OpsBoardTask[]> {
  const { data: tasks, error } = await supabaseAdmin
    .from('ops_tasks')
    .select('*')
    .order('is_special', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)

  const taskIds = (tasks || []).map((t: any) => t.id)

  const [{ data: collabRows }, { data: updateRows }, { data: commentRows }, { data: notifRows }] = await Promise.all([
    supabaseAdmin.from('ops_collaborators').select('task_id').in('task_id', taskIds),
    supabaseAdmin.from('ops_updates').select('task_id').in('task_id', taskIds),
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
  const updateCounts = countBy(updateRows)
  const commentCounts = countBy(commentRows)
  const unreadCounts = countBy(notifRows)

  return (tasks || []).map((t: any) => ({
    ...t,
    collaborator_count: collabCounts[t.id] || 0,
    comment_count: (updateCounts[t.id] || 0) + (commentCounts[t.id] || 0),
    unread_count: unreadCounts[t.id] || 0,
  }))
}
