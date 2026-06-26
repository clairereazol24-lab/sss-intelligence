'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useTheme } from './ThemeProvider'

type Props = { onClose: () => void }

export default function ProfileModal({ onClose }: Props) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameStatus, setNameStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [updatingName, setUpdatingName] = useState(false)

  const [password, setPassword] = useState('')
  const [pwStatus, setPwStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.name) setName(profile.name)
    }
    load()
  }, [])

  const handleNameUpdate = async () => {
    if (!userId) return
    setUpdatingName(true)
    setNameStatus(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('profiles').update({ name }).eq('id', userId)
      if (error) throw error
      setNameStatus({ ok: true, msg: 'Name updated.' })
    } catch (err: any) {
      setNameStatus({ ok: false, msg: err.message || 'Update failed.' })
    } finally {
      setUpdatingName(false)
    }
  }

  const handlePasswordUpdate = async () => {
    if (!password) return
    setUpdating(true)
    setPwStatus(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPwStatus({ ok: true, msg: 'Password updated.' })
      setPassword('')
    } catch (err: any) {
      setPwStatus({ ok: false, msg: err.message || 'Update failed.' })
    } finally {
      setUpdating(false)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const inputCls = 'w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm mb-2 placeholder:text-gray-400 dark:placeholder:text-gray-500'
  const saveBtnCls = 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors'
  const labelCls = 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2'

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed bottom-16 left-4 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{ width: 280 }}
      >
        {/* Name */}
        <div className="p-4">
          <p className={labelCls}>Name</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={inputCls}
          />
          <button onClick={handleNameUpdate} disabled={updatingName} className={saveBtnCls}>
            {updatingName ? 'Saving…' : 'Save'}
          </button>
          {nameStatus && (
            <p className={`text-xs mt-2 ${nameStatus.ok ? 'text-green-600' : 'text-red-500'}`}>
              {nameStatus.msg}
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />

        {/* Change Password */}
        <div className="p-4">
          <p className={labelCls}>Change Password</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className={inputCls}
          />
          <button onClick={handlePasswordUpdate} disabled={updating || !password} className={saveBtnCls}>
            {updating ? 'Updating…' : 'Update'}
          </button>
          {pwStatus && (
            <p className={`text-xs mt-2 ${pwStatus.ok ? 'text-green-600' : 'text-red-500'}`}>
              {pwStatus.msg}
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />

        {/* Theme toggle */}
        <div className="p-4 flex items-center justify-between">
          <span className="text-sm text-gray-700 dark:text-gray-200">Dark mode</span>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />

        {/* Logout */}
        <div className="p-4">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1.5 rounded-lg transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </>
  )
}
