import { headers } from 'next/headers'
import { hasModuleAccess, type ModuleKey, type UserAccess } from '@/lib/auth'

export type MarketingAccess = { userId: string; access: UserAccess }

// middleware.ts already ran auth.getUser() + getUserAccess() for this request and
// forwarded the result via headers — read that instead of repeating both round-trips.
export async function requireMarketingAccess(): Promise<MarketingAccess | null> {
  const h = headers()
  const userId = h.get('x-user-id')
  const role = h.get('x-user-role') as UserAccess['role'] | null
  if (!userId || !role) return null

  const access: UserAccess = {
    role,
    username: h.get('x-user-username') || '',
    name: h.get('x-user-name') || null,
    allowedModules: (h.get('x-user-modules') || '').split(',').filter(Boolean) as ModuleKey[],
  }
  if (!hasModuleAccess(access, 'marketing_efforts')) return null
  return { userId, access }
}
