import { createContext, useContext, useState, useEffect } from 'react'
import { tokenStorage } from '../utils/storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    let isMounted = true

    const restoreSession = async () => {
      const savedToken = tokenStorage.getToken()
      if (!savedToken) {
        if (isMounted) setLoading(false)
        return
      }

      // Safeguard: 5s timeout so network hang never freezes the UI
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${savedToken}`,
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const userData = await response.json()
          if (isMounted) {
            setToken(savedToken)
            setUser(userData)
          }
        } else {
          // Token is invalid, expired, or rejected
          tokenStorage.clearToken()
          if (isMounted) {
            setToken(null)
            setUser(null)
          }
        }
      } catch (err) {
        console.warn('Could not verify existing session token:', err)
        // If aborted or connection failed, clear or keep to prevent infinite hang
      } finally {
        clearTimeout(timeoutId)
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    restoreSession()
    return () => {
      isMounted = false
    }
  }, [])

  // Login action
  const login = async (email, password) => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed')
      }

      // Save encrypted token
      tokenStorage.setToken(data.access_token)
      setToken(data.access_token)

      // Fetch current user details
      const userResponse = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${data.access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error('Failed to retrieve user profile')
      }

      const userData = await userResponse.json()
      setUser(userData)
      return userData
    } catch (err) {
      tokenStorage.clearToken()
      setToken(null)
      setUser(null)
      throw err;
    } finally {
      setLoading(false)
    }
  }

  const setSession = async (accessToken) => {
    tokenStorage.setToken(accessToken)
    setToken(accessToken)
    const userResponse = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (userResponse.ok) {
      const userData = await userResponse.json()
      setUser(userData)
      return userData
    }
  }

  // Logout action
  const logout = () => {
    tokenStorage.clearToken()
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, setSession }}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook to consume the AuthContext easily
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

