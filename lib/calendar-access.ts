import { headers } from 'next/headers'
import { hasModuleAccess, type ModuleKey, type UserAccess } from '@/lib/auth'

export type CalendarAccess = { userId: string; access: UserAccess }

// middleware.ts already ran auth.getUser() + getUserAccess() for this request and
// forwarded the result via headers — read that instead of repeating both round-trips.
// Note: unlike page routes, middleware.ts's moduleForPath() does NOT gate /api/calendar
// paths (it only matches page hrefs), so every API route must call this explicitly.
export async function requireCalendarAccess(): Promise<CalendarAccess | null> {
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
  if (!hasModuleAccess(access, 'calendar')) return null
  return { userId, access }
}
