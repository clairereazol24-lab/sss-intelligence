'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/sss-data', label: 'SSS Data', icon: '📤' },
  { href: '/performance', label: 'Performance', icon: '🏆' },
  { href: '/store-directory', label: 'Store Directory', icon: '🏪' },
  { href: '/ai-report', label: 'AI Report', icon: '🤖' },
  { href: '/marketing-efforts', label: 'Marketing Efforts', icon: '📣' },
]

export default function Sidebar() {
  const pathname = usePathname()
  return (
    <div className="w-60 bg-slate-900 text-white flex flex-col flex-shrink-0">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white tracking-wide">LakiWin</h1>
        <p className="text-xs text-slate-400 mt-0.5">Intelligence Engine</p>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === item.href
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">Relevant Tech · Alpharus</p>
      </div>
    </div>
  )
}
