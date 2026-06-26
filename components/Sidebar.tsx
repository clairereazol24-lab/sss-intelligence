'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ProfileModal from './ProfileModal'
import type { ModuleDef } from '@/lib/auth'

type SidebarProps = {
  modules: ModuleDef[]
  role: 'admin' | 'member'
  username: string
  name: string | null
}

function NavLink({
  href,
  icon,
  label,
  active,
  collapsed,
}: {
  href: string
  icon: string
  label: string
  active: boolean
  collapsed: boolean
}) {
  return (
    <div className="relative group">
      <Link
        href={href}
        className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
          collapsed ? 'justify-center py-2.5 px-0' : 'gap-3 px-3 py-2.5'
        } ${
          active
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <span className="text-base flex-shrink-0">{icon}</span>
        {!collapsed && <span>{label}</span>}
      </Link>
      {collapsed && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          {label}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ modules, role, username, name }: SidebarProps) {
  const pathname = usePathname()
  const [profileOpen, setProfileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true')
    setMounted(true)
  }, [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  return (
    <div
      className={`${collapsed ? 'w-16' : 'w-60'} bg-slate-900 text-white flex flex-col flex-shrink-0 ${
        mounted ? 'transition-all duration-300 ease-in-out' : ''
      }`}
    >
      {/* Header */}
      <div
        className={`border-b border-slate-700 ${
          collapsed ? 'p-4 flex justify-center items-center' : 'p-6'
        }`}
      >
        {collapsed ? (
          <span className="text-lg font-bold text-white">L</span>
        ) : (
          <>
            <h1 className="text-lg font-bold text-white tracking-wide">LakiWin</h1>
            <p className="text-xs text-slate-400 mt-0.5">Intelligence Engine</p>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {modules.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={pathname === item.href}
            collapsed={collapsed}
          />
        ))}
        {role === 'admin' && (
          <NavLink
            href="/accounts"
            icon="⚙️"
            label="Accounts"
            active={pathname === '/accounts'}
            collapsed={collapsed}
          />
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 p-4">
        <div className={`flex items-center ${collapsed ? 'flex-col gap-1' : 'gap-1'}`}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            aria-label={name ?? username}
            className={`flex items-center hover:bg-slate-800 rounded-lg px-2 py-2 transition-colors ${
              collapsed ? 'justify-center w-full' : 'gap-3 flex-1 min-w-0'
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-semibold text-sm">
                {((name ?? username)[0] ?? '?').toUpperCase()}
              </span>
            </div>
            {!collapsed && (
              <span className="text-sm text-slate-300 truncate">{name ?? username}</span>
            )}
          </button>
          <button
            onClick={toggle}
            className={`flex items-center justify-center text-slate-400 hover:text-white transition-colors text-lg rounded-lg hover:bg-slate-800 flex-shrink-0 ${
              collapsed ? 'w-full py-1.5' : 'w-8 h-10'
            }`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
        {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      </div>
    </div>
  )
}
