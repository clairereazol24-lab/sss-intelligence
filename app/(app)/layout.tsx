import Sidebar from '@/components/Sidebar'
import { createClient } from '@/lib/supabase-server'
import { getUserAccess, MODULES } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = user ? await getUserAccess(supabaseAdmin, user.id) : null

  const visibleModules = access
    ? MODULES.filter((m) => access.role === 'admin' || access.allowedModules.includes(m.key))
    : []

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <Sidebar modules={visibleModules} role={access?.role ?? 'member'} username={access?.username ?? ''} name={access?.name ?? null} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
