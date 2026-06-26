'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ProfileModal from './ProfileModal'
import type { ModuleDef } from '@/lib/auth'

type SidebarProps = {
  modules: ModuleDef[]
  role: 'admin' | 'member'
  username: string
}

export default function Sidebar({ modules, role, username }: SidebarProps) {
  const pathname = usePathname()
  const [profileOpen, setProfileOpen] = useState(false)

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === href
        ? 'bg-blue-600 text-white'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`

  return (
    <div className="w-60 bg-slate-900 text-white flex flex-col flex-shrink-0">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white tracking-wide">LakiWin</h1>
        <p className="text-xs text-slate-400 mt-0.5">Intelligence Engine</p>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {modules.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        {role === 'admin' && (
          <Link href="/accounts" className={linkClass('/accounts')}>
            <span className="text-base">⚙️</span>
            Accounts
          </Link>
        )}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="flex items-center gap-3 w-full hover:bg-slate-800 rounded-lg px-2 py-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">
              {(username[0] ?? '?').toUpperCase()}
            </span>
          </div>
          <span className="text-sm text-slate-300 truncate">{username}</span>
        </button>
        {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      </div>
    </div>
  )
}
