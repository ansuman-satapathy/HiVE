import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogOut, Bot, Files, MessageSquare, Search, Cpu, BarChart2 } from 'lucide-react'

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
    <div className="app-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Navigation Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 28px',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-card)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'var(--primary)',
              padding: '8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}>
              <Bot size={20} />
            </div>
            <span style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '18px',
              letterSpacing: '-0.5px',
              color: 'var(--text-primary)'
            }}>
              DocAgent Runtime
            </span>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <NavLink
              to="/workspace"
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--bg-secondary)' : 'transparent',
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
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '9999px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 600
              }}>
                {user.full_name?.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{user.full_name}</span>
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                width: '220px',
                backgroundColor: 'var(--bg-card)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                padding: '12px',
                boxShadow: 'var(--shadow-card)',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                zIndex: 100
              }}>
                <div style={{ padding: '4px 8px 8px 8px', borderBottom: '1px solid var(--border-color)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.full_name}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</p>
                </div>
                
                <button 
                  onClick={logout} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 10px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--error)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    textAlign: 'left',
                    fontWeight: 500,
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
