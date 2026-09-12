import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogOut, Bot, Files, Sparkles } from 'lucide-react'

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
        {/* Brand */}
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
          </nav>
        </div>

        {/* User Profile */}
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
      </header>

      {/* Main Content Viewport */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}
