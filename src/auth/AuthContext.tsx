import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  fetchCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type CurrentUser,
} from '../api/auth'
import { setSessionExpiredHandler } from '../api/client'

interface AuthContextValue {
  user: CurrentUser | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  login: (email: string, password: string) => Promise<void>
  // Sign-up; the server logs the new account in on this session.
  register: (email: string, password: string, confirmPassword: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  // Synchronous mirror of "logged in", so a burst of 401s ends the session once.
  const authenticated = useRef(false)

  const authenticate = useCallback((currentUser: CurrentUser) => {
    authenticated.current = true
    setUser(currentUser)
    setStatus('authenticated')
  }, [])

  // Back to the login screen with nothing of the previous user's data cached.
  const endSession = useCallback(() => {
    authenticated.current = false
    setUser(null)
    setStatus('unauthenticated')
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    fetchCurrentUser()
      .then(authenticate)
      .catch(() => {
        setUser(null)
        setStatus('unauthenticated')
      })
  }, [authenticate])

  // Any API request answering 401 while logged in means the session is gone.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (authenticated.current) endSession()
    })
    return () => setSessionExpiredHandler(null)
  }, [endSession])

  // Every session starts from an empty cache, so nothing cached before this
  // login (whoever it belonged to) can be shown to the user logging in.
  const login = useCallback(
    async (email: string, password: string) => {
      const currentUser = await apiLogin(email, password)
      queryClient.clear()
      authenticate(currentUser)
    },
    [authenticate, queryClient],
  )

  const register = useCallback(
    async (email: string, password: string, confirmPassword: string) => {
      const currentUser = await apiRegister(email, password, confirmPassword)
      queryClient.clear()
      authenticate(currentUser)
    },
    [authenticate, queryClient],
  )

  const logout = useCallback(async () => {
    await apiLogout()
    endSession()
  }, [endSession])

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
