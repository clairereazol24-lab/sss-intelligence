'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (signInError) throw signInError
      router.push('/')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f1629' }}>
      <form onSubmit={handleSubmit} className="rounded-xl border p-8 w-full max-w-md" style={{ backgroundColor: '#1a2340', borderColor: 'rgba(99,102,241,0.25)', boxShadow: '0 0 40px rgba(99,102,241,0.12)' }}>
        <div className="flex justify-center mb-4">
          <svg width="72" height="66" viewBox="0 0 80 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Roof */}
            <polygon points="4,34 40,6 76,34" fill="#4338ca"/>
            <line x1="4" y1="34" x2="76" y2="34" stroke="#6366f1" strokeWidth="1.5"/>
            {/* Store body */}
            <rect x="8" y="33" width="64" height="34" rx="2" fill="#312e81"/>
            {/* Sign banner */}
            <rect x="10" y="26" width="60" height="10" rx="2" fill="#6366f1"/>
            <text x="40" y="34" textAnchor="middle" fill="white" fontSize="5.5" fontFamily="sans-serif" fontWeight="bold">SARI SARI</text>
            {/* Window/counter */}
            <rect x="14" y="39" width="52" height="22" rx="2" fill="#1e1b4b"/>
            {/* Vertical bars */}
            {[22,30,38,46,54,62].map(x => (
              <line key={x} x1={x} y1="39" x2={x} y2="61" stroke="#818cf8" strokeWidth="1.5"/>
            ))}
            {/* Counter ledge */}
            <line x1="14" y1="52" x2="66" y2="52" stroke="#6366f1" strokeWidth="1.5"/>
            {/* Small shelf items */}
            <rect x="18" y="41" width="5" height="8" rx="1" fill="#a5b4fc" opacity="0.7"/>
            <rect x="32" y="42" width="4" height="7" rx="1" fill="#c7d2fe" opacity="0.7"/>
            <rect x="44" y="41" width="5" height="8" rx="1" fill="#a5b4fc" opacity="0.7"/>
            <rect x="57" y="42" width="4" height="7" rx="1" fill="#c7d2fe" opacity="0.7"/>
            {/* Bottom ledge */}
            <rect x="12" y="61" width="56" height="5" rx="2" fill="#4338ca"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-1 text-center">LakiWin</h1>
        <p className="text-sm mb-6 text-center" style={{ color: '#a5b4fc' }}>Sign in to Intelligence Engine</p>

        {error && (
          <div className="border px-3 py-2 rounded-lg mb-4 text-sm" style={{ backgroundColor: 'rgba(153,27,27,0.3)', borderColor: '#7f1d1d', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <label className="block text-xs mb-1" style={{ color: '#818cf8' }}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm mb-4 text-white outline-none transition-colors"
          style={{ backgroundColor: '#0f1629', border: '1px solid #3730a3' }}
          onFocus={e => (e.target.style.borderColor = '#6366f1')}
          onBlur={e => (e.target.style.borderColor = '#3730a3')}
        />

        <label className="block text-xs mb-1" style={{ color: '#818cf8' }}>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm mb-6 text-white outline-none transition-colors"
          style={{ backgroundColor: '#0f1629', border: '1px solid #3730a3' }}
          onFocus={e => (e.target.style.borderColor = '#6366f1')}
          onBlur={e => (e.target.style.borderColor = '#3730a3')}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          style={{ backgroundColor: '#4f46e5' }}
          onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#6366f1' }}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = '#4f46e5'}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
