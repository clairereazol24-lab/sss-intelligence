import { headers } from 'next/headers'
import type { DataPermissionKey } from '@/lib/auth'

// middleware.ts already resolved this user's Import/Export toggles and forwarded
// them via headers (it overwrites any client-sent value), so read those here.
export function hasDataPermission(key: DataPermissionKey): boolean {
  return (headers().get('x-user-data-permissions') || '').split(',').includes(key)
}
