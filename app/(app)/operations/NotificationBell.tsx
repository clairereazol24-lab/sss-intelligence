'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { OpsNotification } from '@/lib/supabase'

export default function NotificationBell() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<OpsNotification[]>([])
  const [open, setOpen] = useState(false)

  const fetchNotifications = async () => {
    const res = await fetch('/api/operations/notifications')
    if (!res.ok) return
    const data = await res.json()
    setNotifications(data.notifications || [])
  }

  useEffect(() => {
    fetchNotifications()
    const channel = supabase
      .channel('ops-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_notifications' }, fetchNotifications)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const handleOpenNotification = async (n: OpsNotification) => {
    await fetch('/api/operations/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id }),
    })
    setOpen(false)
    router.push(`/operations/${n.task_id}`)
    fetchNotifications()
  }

  const handleMarkAllRead = async () => {
    await fetch('/api/operations/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
    fetchNotifications()
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative text-lg px-2 py-1">
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Notifications</span>
            {unreadCount > 0 && <button onClick={handleMarkAllRead} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Mark all read</button>}
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4 text-center">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <button key={n.id} onClick={() => handleOpenNotification(n)} className={`block w-full text-left px-3 py-2 text-xs border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${n.is_read ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200 font-medium'}`}>
                <div>{n.body}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{n.task_title} · {new Date(n.created_at).toLocaleString()}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
