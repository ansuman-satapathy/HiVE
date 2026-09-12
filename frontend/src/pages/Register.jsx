import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Bot } from 'lucide-react'

export default function Register() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed')
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/login')
      }, 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card glass">
        <div className="auth-header">
          <div className="logo-icon-wrapper" style={{ background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '12px', margin: '0 auto 16px' }}>
            <Bot size={24} />
          </div>
          <h2>Create Workspace</h2>
          <p className="auth-subtitle">Set up your local document intelligence workspace</p>
        </div>

        {error && (
          <div className="auth-alert error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="auth-alert success" style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
            <span>Workspace user created successfully! Redirecting to login...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="fullName">Full Name</label>
            <div className="input-wrapper">
              <input
                id="fullName"
                type="text"
                required
                placeholder="Alex Developer"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <input
                id="email"
                type="email"
                required
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <input
                id="password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-wrapper">
              <input
                id="confirmPassword"
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '12px' }}>
            <span>{loading ? 'Creating...' : 'Register Workspace'}</span>
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
