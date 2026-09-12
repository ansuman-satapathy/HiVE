import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Bot } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const { login } = useAuth()
  const navigate = useNavigate()

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
    <div className="auth-container">
      <div className="auth-card glass">
        <div className="auth-header">
          <div className="logo-icon-wrapper" style={{ background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '12px', margin: '0 auto 16px' }}>
            <Bot size={24} />
          </div>
          <h2>DocAgent Runtime</h2>
          <p className="auth-subtitle">Sign in to your document intelligence workspace</p>
        </div>

        {error && (
          <div className="auth-alert error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <input
                id="email"
                type="email"
                required
                placeholder="demo@docagent.com"
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

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '12px' }}>
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 600 }}>Create workspace</Link>
        </div>
      </div>
    </div>
  )
}
