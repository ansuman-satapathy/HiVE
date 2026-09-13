import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2 } from 'lucide-react'

export default function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <Loader2 size={24} className="spin-animate text-blue-500" />
      </div>
    )
  }

  // If user is already authenticated, redirect away from login/register to workspace
  if (user) {
    return <Navigate to="/workspace" replace />
  }

  return children
}
