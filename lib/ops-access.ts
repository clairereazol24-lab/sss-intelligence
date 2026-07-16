import { createClient as createServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getUserAccess, hasModuleAccess, type UserAccess } from '@/lib/auth'

export type OpsAccess = { userId: string; access: UserAccess }

export async function requireOpsAccess(): Promise<OpsAccess | null> {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const access = await getUserAccess(supabaseAdmin, user.id)
  if (!access || !hasModuleAccess(access, 'operations')) return null
  return { userId: user.id, access }
}

export async function requireOpsAdmin(): Promise<OpsAccess | null> {
  const result = await requireOpsAccess()
  if (!result || result.access.role !== 'admin') return null
  return result
}
