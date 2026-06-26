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

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, name, role')
    if (profileError) throw profileError

    const { data: perms, error: permError } = await supabaseAdmin
      .from('module_permissions')
      .select('user_id, module')
    if (permError) throw permError

    const accounts = (profiles || []).map((p: any) => ({
      id: p.id,
      username: p.username,
      name: p.name ?? null,
      role: p.role as 'admin' | 'member',
      modules: (perms || [])
        .filter((perm: any) => perm.user_id === p.id)
        .map((perm: any) => perm.module as string),
    }))

    return NextResponse.json({ accounts })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { username, name, password, modules } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 })
    }

    const email = `${(username as string).trim().toLowerCase()}@lakiwin.internal`

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) throw createError

    const userId = created.user.id

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, username, name: name || null, role: 'member' })
    if (profileError) throw profileError

    if (modules && (modules as string[]).length > 0) {
      const { error: permError } = await supabaseAdmin
        .from('module_permissions')
        .insert((modules as string[]).map((module) => ({ user_id: userId, module })))
      if (permError) throw permError
    }

    return NextResponse.json({ success: true, id: userId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
