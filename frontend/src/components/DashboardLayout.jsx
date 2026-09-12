import { useState, useRef, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { LogOut, Bot, Files, Activity, Layers, Loader2, Sun, Moon } from 'lucide-react'
import TaskQueueDrawer from './TaskQueueDrawer'
import { tokenStorage } from '../utils/storage'

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [queueData, setQueueData] = useState({ active_count: 0, active_tasks: [], recent_completed: [] })
  const dropdownRef = useRef(null)

  const fetchQueue = useCallback(async () => {
    try {
      const token = tokenStorage.getToken()
      if (!token) return
      const res = await fetch('/api/documents/queue', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setQueueData(data)
      }
    } catch (err) {
      console.error('Queue poll error:', err)
    }
  }, [])

  const activeCount = queueData?.active_count || 0

  useEffect(() => {
    let timeoutId
    let isMounted = true

    const runPoll = async () => {
      await fetchQueue()
      if (!isMounted) return
      const interval = activeCount > 0 || drawerOpen ? 2000 : 15000
      timeoutId = setTimeout(runPoll, interval)
    }

    runPoll()
    return () => {
      isMounted = false
      clearTimeout(timeoutId)
    }
  }, [fetchQueue, activeCount, drawerOpen])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 lg:px-10 py-3.5 border-b border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors">
        {/* Brand & Nav */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Bot size={18} />
            </div>
            <span className="font-bold text-base tracking-tight text-[var(--text-primary)]">
              QuickDesk
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1.5">
            <NavLink
              to="/workspace"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-500/10 text-blue-500 font-semibold dark:bg-blue-500/15'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`
              }
            >
              <Files size={15} />
              <span>Workspace</span>
            </NavLink>

            <NavLink
              to="/workspace/documents"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-500/10 text-blue-500 font-semibold dark:bg-blue-500/15'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`
              }
            >
              <Layers size={15} />
              <span>Documents</span>
            </NavLink>
          </nav>
        </div>

        {/* Right Section: Theme Toggle + Task Indicator + Profile */}
        <div className="flex items-center gap-3">
          {/* Dark / Light Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all flex items-center justify-center"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-slate-600" />}
          </button>

          {/* Background Tasks Indicator Button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
              activeCount > 0
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 pulse-glow'
                : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
            }`}
          >
            {activeCount > 0 ? (
              <Loader2 size={13} className="spin-animate text-blue-500" />
            ) : (
              <Activity size={13} />
            )}
            <span>
              {activeCount > 0 ? `${activeCount} Ingesting...` : 'Tasks'}
            </span>
          </button>

          {/* User Profile Dropdown */}
          {user && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs font-medium transition-all"
              >
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {user.full_name?.charAt(0).toUpperCase()}
                </div>
                <span>{user.full_name}</span>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 shadow-xl flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-[var(--border-default)] mb-1">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{user.full_name}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
                  </div>

                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors text-left"
                  >
                    <LogOut size={13} />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>

      {/* Live Slide-out Task Queue Drawer */}
      <TaskQueueDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        queueData={queueData}
        onRefresh={fetchQueue}
      />
    </div>
  )
}
