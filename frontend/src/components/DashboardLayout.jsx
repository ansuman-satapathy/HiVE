import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useTaskQueue } from '../context/TaskQueueContext'
import { LogOut, Bot, Files, Activity, Layers, Loader2, Sun, Moon, MessageSquare } from 'lucide-react'
import TaskQueueDrawer from './TaskQueueDrawer'

import HiveLogo from './HiveLogo'

const NAV_ITEMS = [
  { to: '/workspace', label: 'Workspace', icon: Files, end: true },
  { to: '/workspace/chat', label: 'Chat', icon: MessageSquare },
  { to: '/workspace/documents', label: 'Documents', icon: Layers },
  { to: '/workspace/retrieval', label: 'Playground', icon: Activity },
]

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { queueData, activeCount, drawerOpen, setDrawerOpen, fetchQueue } = useTaskQueue()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const location = useLocation()

  // Material 3 Expressive Sliding Pill Indicator State
  const navRef = useRef(null)
  const itemRefs = useRef({})
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 })

  // Update sliding indicator position on route change or resize
  useLayoutEffect(() => {
    const updateIndicator = () => {
      if (!navRef.current) return

      // Find which route is active
      const activeItem = NAV_ITEMS.find((item) => {
        if (item.end) return location.pathname === item.to
        return location.pathname.startsWith(item.to)
      })

      if (activeItem && itemRefs.current[activeItem.to]) {
        const itemEl = itemRefs.current[activeItem.to]
        const navEl = navRef.current
        const navRect = navEl.getBoundingClientRect()
        const itemRect = itemEl.getBoundingClientRect()

        setIndicatorStyle({
          left: itemRect.left - navRect.left,
          width: itemRect.width,
          opacity: 1,
        })
      } else {
        setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }))
      }
    }

    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [location.pathname])

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
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 lg:px-10 py-2.5 border-b border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors">
        {/* Brand & Nav */}
        <div className="flex items-center gap-8">
          <HiveLogo size="md" />

          {/* Material 3 Expressive Navigation Bar */}
          <nav ref={navRef} className="m3-nav-container">
            {/* Sliding Active Pill Indicator */}
            <div
              className="m3-nav-pill-indicator"
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
                opacity: indicatorStyle.opacity,
              }}
            />

            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                ref={(el) => {
                  if (el) itemRefs.current[to] = el
                }}
                className={({ isActive }) =>
                  `m3-nav-item ${isActive ? 'is-active' : ''}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="m3-icon-badge">
                      <Icon
                        size={15}
                        className={`transition-transform duration-300 ${
                          isActive ? 'scale-110 stroke-[2.2]' : 'stroke-[1.75]'
                        }`}
                      />
                    </span>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
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
