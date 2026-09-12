import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Bot, Check, ArrowRight, ShieldCheck, Database, Key, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

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
      // 1. Register admin user
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

      // 2. Log in and acquire token
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const loginData = await loginRes.json()
      if (!loginRes.ok) {
        throw new Error('User created but login failed. Please sign in.')
      }

      // 3. Establish active session and enter workspace
      await setSession(loginData.access_token)
      navigate('/workspace')
    } catch (err) {
      setError(err.message || 'Setup encountered an error')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'var(--bg-canvas)',
      padding: '40px 20px',
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-lg)',
        padding: '36px 32px',
      }}>
        {/* Coolify-style Header Badge */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary) 0%, #1d4ed8 100%)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-md)',
          }}>
            <Bot size={24} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--primary-subtle)', color: 'var(--primary)', fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>
            <Sparkles size={12} />
            INITIAL SETUP
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', letterSpacing: '-0.3px' }}>
            Initialize DocAgent
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Configure your self-hosted autonomous document intelligence runtime
          </p>
        </div>

        {/* Step Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border-default)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: step >= 1 ? 'var(--primary)' : 'var(--border-default)',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {step > 1 ? <Check size={14} /> : '1'}
            </div>
            <span style={{ fontSize: '12px', fontWeight: step === 1 ? 600 : 400, color: step === 1 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Root Admin
            </span>
          </div>

          <div style={{ width: '32px', height: '1px', backgroundColor: 'var(--border-default)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: step >= 2 ? 'var(--primary)' : 'var(--border-default)',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              2
            </div>
            <span style={{ fontSize: '12px', fontWeight: step === 2 ? 600 : 400, color: step === 2 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Workspace
            </span>
          </div>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--error-bg)',
            border: '1px solid var(--error-border)',
            color: 'var(--error)',
            fontSize: '13px',
            marginBottom: '20px',
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Root Administrator Credentials */}
        {step === 1 && (
          <form onSubmit={handleCreateRootAdmin} className="auth-form">
            <div className="input-group">
              <label htmlFor="fullName">Root Administrator Name</label>
              <div className="input-wrapper">
                <input
                  id="fullName"
                  type="text"
                  required
                  placeholder="System Administrator"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="admin@docagent.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="password">Admin Password (min. 6 chars)</label>
              <div className="input-wrapper">
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '10px', padding: '11px', gap: '8px' }}
            >
              <span>Continue to Workspace Config</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* Step 2: Workspace Config & API Keys */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="input-group">
              <label htmlFor="wsName">Primary Workspace Name</label>
              <div className="input-wrapper">
                <input
                  id="wsName"
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Production Workspace"
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="apiKey" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>NVIDIA NIM / OpenAI API Key</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Optional</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="apiKey"
                  type="password"
                  value={nvidiaApiKey}
                  onChange={(e) => setNvidiaApiKey(e.target.value)}
                  placeholder="nvapi-... (can configure later)"
                />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Powers hybrid dense vector embeddings and neural cross-encoder reranking.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '11px' }}
                disabled={loading}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCompleteSetup}
                className="btn btn-primary"
                style={{ flex: 2, padding: '11px', gap: '8px' }}
                disabled={loading}
              >
                {loading ? <Loader2 size={16} className="spin-animate" /> : <Sparkles size={16} />}
                <span>{loading ? 'Initializing...' : 'Complete & Launch'}</span>
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
          Already configured? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in here</Link>
        </div>
      </div>
    </div>
  )
}
