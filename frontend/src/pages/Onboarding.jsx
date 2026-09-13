import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Check, ArrowRight, Sparkles, Loader2, AlertCircle, Sun, Moon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import HiveLogo from '../components/HiveLogo'

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceName, setWorkspaceName] = useState('Production Workspace')
  const [nvidiaApiKey, setNvidiaApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const { setSession } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    async function checkExisting() {
      try {
        const res = await fetch('/api/auth/status')
        if (res.ok) {
          const data = await res.json()
          if (data.initialized) {
            navigate('/login')
          }
        }
      } catch (err) {
        console.error('Failed to query status:', err)
      }
    }
    checkExisting()
  }, [navigate])

  const handleCreateRootAdmin = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleCompleteSetup = async () => {
    setLoading(true)
    setError(null)

    try {
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
        }),
      })

      const registerData = await registerRes.json()
      if (!registerRes.ok) {
        throw new Error(registerData.detail || 'Failed to initialize administrator')
      }

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const loginData = await loginRes.json()
      if (!loginRes.ok) {
        throw new Error('User created but login failed. Please sign in.')
      }

      await setSession(loginData.access_token)
      navigate('/workspace')
    } catch (err) {
      setError(err.message || 'Setup encountered an error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative transition-colors duration-200" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      {/* Theme toggle */}
      <div className="absolute top-6 right-6">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all shadow-sm flex items-center justify-center"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-slate-600" />}
        </button>
      </div>

      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-8 sm:p-10 shadow-xl transition-all">
        {/* Header Badge */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-3">
            <HiveLogo size="lg" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[11px] font-semibold mb-2">
            <Sparkles size={11} />
            <span>INITIAL SETUP</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Setup HiVE
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Configure your self-hosted document intelligence workspace
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-8 pb-5 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-[var(--border-default)] text-[var(--text-muted)]'
            }`}>
              {step > 1 ? <Check size={13} /> : '1'}
            </div>
            <span className={`text-xs ${step === 1 ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              Admin Account
            </span>
          </div>

          <div className="w-8 h-px bg-[var(--border-default)]" />

          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-[var(--border-default)] text-[var(--text-muted)]'
            }`}>
              2
            </div>
            <span className={`text-xs ${step === 2 ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              Workspace
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-3.5 mb-6 rounded-lg text-sm bg-red-500/10 border border-red-500/25 text-red-500 dark:text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Root Administrator Credentials */}
        {step === 1 && (
          <form onSubmit={handleCreateRootAdmin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Administrator Name
              </label>
              <input
                type="text"
                required
                placeholder="System Admin"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="admin@hive.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Password (min. 6 chars)
              </label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99]"
            >
              <span>Continue to Workspace</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* Step 2: Workspace Config & API Keys */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Workspace Name
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Production Workspace"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  NVIDIA NIM / OpenAI API Key
                </label>
                <span className="text-[11px] text-[var(--text-muted)]">Optional</span>
              </div>
              <input
                type="password"
                value={nvidiaApiKey}
                onChange={(e) => setNvidiaApiKey(e.target.value)}
                placeholder="nvapi-... (can configure later)"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                Used for embeddings and neural cross-encoder reranking.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                className="flex-1 py-2.5 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] text-sm font-medium transition-all"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={loading}
                className="flex-[2] py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="spin-animate" /> : <Sparkles size={16} />}
                <span>{loading ? 'Initializing...' : 'Complete Setup'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-[var(--border-default)] text-center text-xs text-[var(--text-secondary)]">
          Already configured?{' '}
          <Link to="/login" className="text-blue-500 hover:text-blue-400 font-semibold transition-colors">
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  )
}
