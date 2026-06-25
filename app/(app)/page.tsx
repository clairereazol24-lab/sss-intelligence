import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getUserAccess, MODULES } from '@/lib/auth'

export default async function Home() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const access = await getUserAccess(supabase, user.id)
  const firstAllowed = MODULES.find((m) => access && (access.role === 'admin' || access.allowedModules.includes(m.key)))

  if (firstAllowed) redirect(firstAllowed.href)

  return (
    <div className="p-6">
      <p className="text-sm text-gray-500">You don&apos;t have access to any modules yet. Contact your admin.</p>
    </div>
  )
}
