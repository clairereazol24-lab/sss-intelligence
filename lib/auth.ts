import type { SupabaseClient } from '@supabase/supabase-js'

export type ModuleKey = 'dashboard' | 'sss_data' | 'members' | 'performance' | 'store_directory' | 'locked_retailers' | 'operations' | 'calendar' | 'ai_report' | 'marketing_efforts'

export type ModuleDef = {
  key: ModuleKey
  label: string
  href: string
  icon: string
  children?: { label: string; href: string }[]
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: '📊' },
  {
    key: 'sss_data',
    label: 'SSS Data',
    href: '/sss-data',
    icon: '📤',
    children: [
      { label: 'Alpharus', href: '/sss-data/alpharus' },
      { label: 'Relevant Tech', href: '/sss-data/relevant-tech' },
      { label: 'Company', href: '/sss-data/company' },
    ],
  },
  {
    key: 'members',
    label: 'Members',
    href: '/members',
    icon: '👥',
    children: [
      { label: 'Alpharus', href: '/members/alpharus' },
      { label: 'Relevant Tech', href: '/members/relevant-tech' },
      { label: 'Company', href: '/members/company' },
    ],
  },
  {
    key: 'performance',
    label: 'Performance',
    href: '/performance',
    icon: '🏆',
    children: [
      { label: 'Alpharus', href: '/performance/alpharus' },
      { label: 'Relevant Tech', href: '/performance/relevant-tech' },
      { label: 'Company', href: '/performance/company' },
    ],
  },
  {
    key: 'store_directory',
    label: 'Store Directory',
    href: '/store-directory',
    icon: '🏪',
    children: [
      { label: 'Alpharus', href: '/store-directory/alpharus' },
      { label: 'Relevant Tech', href: '/store-directory/relevant-tech' },
      { label: 'Company', href: '/store-directory/company' },
    ],
  },
  { key: 'locked_retailers', label: 'Shortcut', href: '/locked-retailers', icon: '🔒' },
  { key: 'operations', label: 'Operations', href: '/operations', icon: '📋' },
  { key: 'calendar', label: 'Calendar', href: '/calendar', icon: '📅' },
  // ai_report hidden — restore by uncommenting
  // { key: 'ai_report', label: 'AI Report', href: '/ai-report', icon: '🤖' },
  { key: 'marketing_efforts', label: 'Marketing Performance', href: '/marketing-efforts', icon: '📣' },
]

// Per-account Import/Export toggles, stored as extra rows in module_permissions.
// Unlike modules, these apply to admins too — CSV import can wipe/replace live
// data (see the Alpharus wipe incident), so it's never granted by role alone.
export type DataPermissionKey = 'data_import' | 'data_export'

export const DATA_PERMISSIONS: { key: DataPermissionKey; label: string }[] = [
  { key: 'data_import', label: 'Can Import' },
  { key: 'data_export', label: 'Can Export' },
]

export function isDataPermissionKey(key: string): key is DataPermissionKey {
  return DATA_PERMISSIONS.some((p) => p.key === key)
}

export type UserAccess = {
  role: 'admin' | 'member'
  username: string
  name: string | null
  allowedModules: ModuleKey[]
  dataPermissions: DataPermissionKey[]
}

export async function getUserAccess(supabase: SupabaseClient, userId: string): Promise<UserAccess | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, name, role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  const { data: perms } = await supabase
    .from('module_permissions')
    .select('module')
    .eq('user_id', userId)

  const keys: string[] = (perms || []).map((p: any) => p.module)
  const dataPermissions = keys.filter(isDataPermissionKey)

  if (profile.role === 'admin') {
    return { role: 'admin', username: profile.username, name: profile.name ?? null, allowedModules: MODULES.map((m) => m.key), dataPermissions }
  }

  return {
    role: 'member',
    username: profile.username,
    name: profile.name ?? null,
    allowedModules: keys.filter((k) => !isDataPermissionKey(k)) as ModuleKey[],
    dataPermissions,
  }
}

export function hasModuleAccess(access: UserAccess, module: ModuleKey): boolean {
  return access.role === 'admin' || access.allowedModules.includes(module)
}

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))
  return match ? match.key : null
}
