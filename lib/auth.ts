import type { SupabaseClient } from '@supabase/supabase-js'

export type ModuleKey = 'dashboard' | 'sss_data' | 'members' | 'performance' | 'store_directory' | 'locked_retailers' | 'operations' | 'ai_report' | 'marketing_efforts'

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
    ],
  },
  { key: 'locked_retailers', label: 'Shortcut', href: '/locked-retailers', icon: '🔒' },
  { key: 'operations', label: 'Operations', href: '/operations', icon: '📋' },
  // ai_report and marketing_efforts hidden — restore by uncommenting
  // { key: 'ai_report', label: 'AI Report', href: '/ai-report', icon: '🤖' },
  // { key: 'marketing_efforts', label: 'Marketing Efforts', href: '/marketing-efforts', icon: '📣' },
]

export type UserAccess = {
  role: 'admin' | 'member'
  username: string
  name: string | null
  allowedModules: ModuleKey[]
}

// SSS Data's CSV import can wipe/replace live performance data (see the Alpharus
// wipe incident) — restrict it to this one account rather than the whole admin role.
export const DATA_IMPORT_ALLOWED_USERNAME = 'claire@racphil.com'

export async function getUserAccess(supabase: SupabaseClient, userId: string): Promise<UserAccess | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, name, role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  if (profile.role === 'admin') {
    return { role: 'admin', username: profile.username, name: profile.name ?? null, allowedModules: MODULES.map((m) => m.key) }
  }

  const { data: perms } = await supabase
    .from('module_permissions')
    .select('module')
    .eq('user_id', userId)

  return {
    role: 'member',
    username: profile.username,
    name: profile.name ?? null,
    allowedModules: (perms || []).map((p: any) => p.module as ModuleKey),
  }
}

export function hasModuleAccess(access: UserAccess, module: ModuleKey): boolean {
  return access.role === 'admin' || access.allowedModules.includes(module)
}

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))
  return match ? match.key : null
}
