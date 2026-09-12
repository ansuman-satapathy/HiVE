import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Bot, Sun, Moon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    async function checkInstance() {
      try {
        const res = await fetch('/api/auth/status')
        if (res.ok) {
          const data = await res.json()
          if (!data.initialized) {
            navigate('/onboarding')
          }
        }
      } catch (err) {
        console.error('Failed to query auth status:', err)
      }
    }
    checkInstance()
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await login(email, password)
      navigate('/workspace')
    } catch (err) {
      setError(err.message || 'Incorrect email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative transition-colors duration-200" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      {/* Top right theme toggle */}
      <div className="absolute top-6 right-6">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all shadow-sm flex items-center justify-center"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-slate-600" />}
        </button>
      </div>

      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-8 sm:p-10 shadow-xl transition-all">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white mx-auto mb-4 shadow-md shadow-blue-500/20">
            <Bot size={26} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            QuickDesk
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5">
            Sign in to your document intelligence workspace
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-3.5 mb-6 rounded-lg text-sm bg-red-500/10 border border-red-500/25 text-red-500 dark:text-red-400">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="demo@docagent.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            {!loading && <ArrowRight size={16} />}
          </button>

          <button
            type="button"
            onClick={() => {
              setEmail('demo@docagent.com')
              setPassword('password123')
            }}
            className="w-full py-2 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-all flex items-center justify-center gap-1.5"
          >
            <span>⚡ Fill Default Admin Credentials</span>
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[var(--border-default)] text-center text-xs text-[var(--text-secondary)]">
          Need initial setup?{' '}
          <Link to="/onboarding" className="text-blue-500 hover:text-blue-400 font-semibold transition-colors">
            Setup Wizard
          </Link>
        </div>
      </div>
    </div>
  )
}
