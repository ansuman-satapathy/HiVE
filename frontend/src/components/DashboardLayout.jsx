import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useTaskQueue } from '../context/TaskQueueContext'
import { LogOut, Bot, Files, Activity, Layers, Loader2, Sun, Moon, MessageSquare, SlidersHorizontal, Settings } from 'lucide-react'
import TaskQueueDrawer from './TaskQueueDrawer'
import SettingsModal from './SettingsModal'

import HiveLogo from './HiveLogo'

const NAV_ITEMS = [
  { to: '/workspace', label: 'Workspace', icon: Files, end: true },
  { to: '/workspace/chat', label: 'Chat', icon: MessageSquare },
  { to: '/workspace/documents', label: 'Documents', icon: Layers },
  { to: '/workspace/retrieval', label: 'Studio', icon: SlidersHorizontal },
]

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { queueData, activeCount, drawerOpen, setDrawerOpen, fetchQueue } = useTaskQueue()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
      <header className="sticky top-0 z-40 h-14 flex items-center justify-between px-6 lg:px-8 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/95 backdrop-blur-md transition-colors">
        {/* Brand & Nav */}
        <div className="flex items-center gap-7">
          <HiveLogo size="md" />

          {/* Workspace Segmented Navigation Bar */}
          <nav ref={navRef} className="workspace-nav-container">
            {/* Sliding Active Card Indicator */}
            <div
              className="workspace-nav-indicator"
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
                  `workspace-nav-item ${isActive ? 'is-active' : ''}`
                }
              >
                <Icon
                  size={14}
                  className="nav-icon shrink-0"
                />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right Section: Theme Toggle + Task Indicator + Profile */}
        <div className="flex items-center gap-2.5">
          {/* Dark / Light Toggle */}
          <button
            onClick={toggleTheme}
            className="h-8 w-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center cursor-pointer shadow-xs"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-slate-600" />}
          </button>

          {/* Background Tasks Indicator Button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`h-8 px-3 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
              activeCount > 0
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 pulse-glow'
                : 'border-[var(--border-default)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
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
                className="h-8 pl-1.5 pr-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs font-medium transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
                  {user.full_name?.charAt(0).toUpperCase()}
                </div>
                <span>{user.full_name}</span>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 shadow-xl flex flex-col gap-0.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-[var(--border-default)] mb-1">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{user.full_name}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
                  </div>

                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                      setSettingsOpen(true)
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <Settings size={13} className="text-blue-500" />
                    <span>Workspace Settings</span>
                  </button>

                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

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
