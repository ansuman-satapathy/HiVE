import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2, RefreshCw } from 'lucide-react'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-canvas)] text-[var(--text-secondary)] transition-colors">
        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shadow-xs">
          <Loader2 size={22} className="spin-animate" />
        </div>
        <p className="text-xs font-medium text-[var(--text-muted)]">Verifying workspace session...</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shadow-2xs cursor-pointer"
        >
          <RefreshCw size={12} />
          <span>Reload</span>
        </button>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}
