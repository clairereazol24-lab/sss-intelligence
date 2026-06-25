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
  const access = await getUserAccess(supabase, user.id)
  return access?.role === 'admin' ? user : null
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { username, modules, password } = await request.json()
    const userId = params.id

    if (username) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ username })
        .eq('id', userId)
      if (profileError) throw profileError
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

      if (modules.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('module_permissions')
          .insert(modules.map((module: string) => ({ user_id: userId, module })))
        if (insertError) throw insertError
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
