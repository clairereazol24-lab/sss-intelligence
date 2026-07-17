import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getUserAccess } from '@/lib/auth'

export const runtime = 'nodejs'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const access = await getUserAccess(supabaseAdmin, user.id)
  return access?.role === 'admin' ? user : null
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { username, name, modules, password } = await request.json()
    const userId = params.id

    const profileUpdate: { username?: string; name?: string | null } = {}
    if (username) profileUpdate.username = username
    if (name !== undefined) profileUpdate.name = name || null

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)
      if (profileError) throw profileError
    }

    if (username) {
      const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(userId, { email: (username as string).trim().toLowerCase() })
      if (emailError) throw emailError
    }

    if (password) {
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
      if (pwError) throw pwError
    }

    if (modules) {
      const { error: deleteError } = await supabaseAdmin
        .from('module_permissions')
        .delete()
        .eq('user_id', userId)
      if (deleteError) throw deleteError

      if ((modules as string[]).length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('module_permissions')
          .insert((modules as string[]).map((module) => ({ user_id: userId, module })))
        if (insertError) throw insertError
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userId = params.id
  if (userId === admin.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }

  try {
    await supabaseAdmin.from('module_permissions').delete().eq('user_id', userId)
    const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId)
    if (profileError) throw profileError

    // Deleting the profile already revokes app access (login redirects to /login with
    // no profile row). Removing the underlying auth user can fail if their id is still
    // referenced by historical rows (e.g. ops_activity_log) — treat that as best-effort
    // rather than failing the whole request.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    return NextResponse.json({ success: true, authDeleted: !authError })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
