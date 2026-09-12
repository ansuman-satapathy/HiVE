import { useState, useRef, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogOut, Bot, Files, Sparkles, Activity, Layers, Loader2 } from 'lucide-react'
import TaskQueueDrawer from './TaskQueueDrawer'
import { tokenStorage } from '../utils/storage'

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth()
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

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 2500)
    return () => clearInterval(interval)
  }, [fetchQueue])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const activeCount = queueData?.active_count || 0

  return (
    <div className="app-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-canvas)' }}>
      {/* Navigation Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 32px',
        borderBottom: '1px solid var(--border-default)',
        backgroundColor: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        {/* Brand & Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--primary) 0%, #1d4ed8 100%)',
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: 'var(--shadow-xs)'
            }}>
              <Bot size={20} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: '17px',
                letterSpacing: '-0.3px',
                color: 'var(--text-primary)'
              }}>
                DocAgent Runtime
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <NavLink
              to="/workspace"
              end
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                fontWeight: 500,
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--primary-subtle)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              })}
            >
              <Files size={16} />
              <span>Workspace</span>
            </NavLink>

            <NavLink
              to="/workspace/documents"
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                fontWeight: 500,
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--primary-subtle)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              })}
            >
              <Layers size={16} />
              <span>Documents</span>
            </NavLink>
          </nav>
        </div>

        {/* Right Section: Task Indicator + Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Background Tasks Indicator Button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`btn btn-secondary btn-sm ${activeCount > 0 ? 'pulse-glow' : ''}`}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              gap: '8px',
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: activeCount > 0 ? 'var(--primary-subtle)' : 'var(--bg-surface)',
              borderColor: activeCount > 0 ? 'var(--primary-border)' : 'var(--border-default)',
              color: activeCount > 0 ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            {activeCount > 0 ? (
              <Loader2 size={13} className="spin-animate" />
            ) : (
              <Activity size={13} />
            )}
            <span>
              {activeCount > 0 ? `${activeCount} Ingesting...` : 'Tasks'}
            </span>
          </button>

          {/* User Profile Dropdown */}
          {user && (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="btn btn-secondary btn-sm"
                style={{
                  borderRadius: 'var(--radius-full)',
                  padding: '5px 14px',
                  gap: '8px',
                }}
              >
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 600
                }}>
                  {user.full_name?.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{user.full_name}</span>
              </button>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  width: '220px',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-default)',
                  padding: '12px',
                  boxShadow: 'var(--shadow-lg)',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  zIndex: 100
                }}>
                  <div style={{ padding: '4px 8px 8px 8px', borderBottom: '1px solid var(--border-default)' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.full_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</p>
                  </div>
                  
                  <button 
                    onClick={logout} 
                    className="btn btn-ghost"
                    style={{
                      color: 'var(--error)',
                      justifyContent: 'flex-start',
                      padding: '8px 10px',
                      fontSize: '13px',
                    }}
                  >
                    <LogOut size={14} />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
