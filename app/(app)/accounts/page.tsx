'use client'
import { useEffect, useState } from 'react'
import { MODULES } from '@/lib/auth'

type Account = {
  id: string
  username: string
  email: string
  modules: string[]
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editModules, setEditModules] = useState<string[]>([])
  const [editPassword, setEditPassword] = useState('')

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

  const handleAdd = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, modules: selectedModules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create account.')
      setShowAdd(false)
      setEmail(''); setPassword(''); setUsername(''); setSelectedModules([])
      fetchAccounts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (acct: Account) => {
    setEditingId(acct.id)
    setEditUsername(acct.username)
    setEditModules(acct.modules)
    setEditPassword('')
  }

  const handleEditSave = async () => {
    if (!editingId) return
    setSaving(true)
    setError('')
    try {
      const body: any = { username: editUsername, modules: editModules }
      if (editPassword) body.password = editPassword
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Accounts</h1>
          <p className="text-sm text-gray-500">Manage member logins and module access.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Add Account
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">New Account</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            {MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={selectedModules.includes(m.key)}
                  onChange={() => toggleModule(selectedModules, setSelectedModules, m.key)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              {saving ? 'Creating...' : 'Create Account'}
            </button>
            <button onClick={() => setShowAdd(false)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-400">No member accounts yet.</p>
        ) : (
          <div className="space-y-3">
            {accounts.map((acct) => (
              <div key={acct.id} className="border border-gray-100 rounded-lg p-4">
                {editingId === acct.id ? (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Username" />
                      <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} type="password" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="New password (optional)" />
                    </div>
                    <div className="flex flex-wrap gap-3 mb-4">
                      {MODULES.map((m) => (
                        <label key={m.key} className="flex items-center gap-2 text-sm text-gray-600">
                          <input
                            type="checkbox"
                            checked={editModules.includes(m.key)}
                            onChange={() => toggleModule(editModules, setEditModules, m.key)}
                          />
                          {m.label}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleEditSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{acct.username}</p>
                      <p className="text-xs text-gray-400">{acct.email}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {acct.modules.length === 0 ? (
                          <span className="text-xs text-gray-400">No modules granted</span>
                        ) : (
                          acct.modules.map((m) => (
                            <span key={m} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
                              {MODULES.find((mod) => mod.key === m)?.label || m}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <button onClick={() => startEdit(acct)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
