'use client'
import { useEffect, useState } from 'react'
import { MODULES } from '@/lib/auth'

type Account = {
  id: string
  username: string
  name: string | null
  role: 'admin' | 'member'
  modules: string[]
}

const inputCls = 'border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm w-full'
const btnPrimary = 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors'
const btnSecondary = 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editModules, setEditModules] = useState<string[]>([])

  const [showAdd, setShowAdd] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addName, setAddName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addModules, setAddModules] = useState<string[]>([])

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load accounts.')
      setAccounts(data.accounts || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  const toggleModule = (list: string[], setList: (m: string[]) => void, key: string) => {
    setList(list.includes(key) ? list.filter((m) => m !== key) : [...list, key])
  }

  const startEdit = (acct: Account) => {
    setEditingId(acct.id)
    setEditUsername(acct.username)
    setEditName(acct.name ?? '')
    setEditPassword('')
    setEditModules(acct.modules)
    setShowAdd(false)
  }

  const handleEditSave = async () => {
    if (!editingId) return
    setSaving(true)
    setError('')
    try {
      const editingAccount = accounts.find(a => a.id === editingId)
      const body: Record<string, unknown> = { username: editUsername, name: editName }
      if (editPassword) body.password = editPassword
      if (editingAccount?.role !== 'admin') body.modules = editModules
      const res = await fetch(`/api/accounts/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update account.')
      setEditingId(null)
      fetchAccounts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: addUsername, name: addName, password: addPassword, modules: addModules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create account.')
      setShowAdd(false)
      setAddUsername(''); setAddName(''); setAddPassword(''); setAddModules([])
      fetchAccounts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelAdd = () => {
    setShowAdd(false)
    setAddUsername(''); setAddName(''); setAddPassword(''); setAddModules([])
  }

  const thCls = 'text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 text-sm'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Accounts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage member logins and module access.</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null) }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Add Account
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 p-5">Loading...</p>
        ) : accounts.length === 0 && !showAdd ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 p-5">No accounts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className={thCls}>Email</th>
                <th className={thCls}>Name</th>
                <th className={thCls}>Password</th>
                <th className={thCls}>Access</th>
                <th className="bg-gray-50 dark:bg-gray-700/50 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acct) => {
                if (editingId === acct.id) {
                  return (
                    <tr key={acct.id} className="border-b border-gray-100 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-900/10">
                      <td className="px-4 py-3">
                        <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className={inputCls} />
                        {acct.role === 'admin' && (
                          <span className="mt-1 inline-block text-xs text-gray-400 dark:text-gray-500">Admin</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} /></td>
                      <td className="px-4 py-3"><input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="New password (optional)" className={inputCls} /></td>
                      <td className="px-4 py-3">
                        {acct.role === 'admin' ? (
                          <span className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs px-2 py-0.5 rounded">All Access</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {MODULES.map((m) => (
                              <label key={m.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                                <input type="checkbox" checked={editModules.includes(m.key)} onChange={() => toggleModule(editModules, setEditModules, m.key)} />
                                {m.label}
                              </label>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={handleEditSave} disabled={saving} className={btnPrimary}>
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className={btnSecondary}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={acct.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">
                      {acct.username}
                      {acct.role === 'admin' && (
                        <span className="ml-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs px-1.5 py-0.5 rounded">Admin</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{acct.name ?? ''}</td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500">••••••••</td>
                    <td className="px-4 py-3">
                      {acct.role === 'admin' ? (
                        <span className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs px-2 py-0.5 rounded">All Access</span>
                      ) : acct.modules.length === 0 ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500">No access</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {acct.modules.map((m) => (
                            <span key={m} className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs px-2 py-0.5 rounded">
                              {MODULES.find((mod) => mod.key === m)?.label ?? m}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => startEdit(acct)} className={btnSecondary}>Edit</button>
                    </td>
                  </tr>
                )
              })}

              {showAdd && (
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-green-50/30 dark:bg-green-900/10">
                  <td className="px-4 py-3"><input type="email" value={addUsername} onChange={(e) => setAddUsername(e.target.value)} placeholder="Email address" className={inputCls} /></td>
                  <td className="px-4 py-3"><input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name" className={inputCls} /></td>
                  <td className="px-4 py-3"><input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="Password" className={inputCls} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {MODULES.map((m) => (
                        <label key={m.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                          <input type="checkbox" checked={addModules.includes(m.key)} onChange={() => toggleModule(addModules, setAddModules, m.key)} />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={handleAdd} disabled={saving} className={btnPrimary}>
                        {saving ? 'Creating...' : 'Create'}
                      </button>
                      <button onClick={cancelAdd} className={btnSecondary}>Cancel</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
