import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../store/StoreContext'
import type { ModuleId, Role, User } from '../types'
import { ROLE_MODULES } from '../types'
import { getApiToken, setApiToken } from '../lib/apiClient'

const STAFF_SESSION_KEY = 'polleria-staff-session'

interface AuthApi {
  user: User | null
  apiReady: boolean
  loginWithSession: (user: { id: string; name: string; email: string; role: Role }) => Promise<void>
  logout: () => void
  can: (module: ModuleId) => boolean
  resetStaffPassword: (email: string, newPassword: string) => boolean
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state, saveUser, reloadFromApi } = useStore()
  const [apiUser, setApiUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('polleria-api-user')
      return raw ? (JSON.parse(raw) as User) : null
    } catch {
      return null
    }
  })

  const user = apiUser

  const loginWithSession = async (uIn: { id: string; name: string; email: string; role: Role }) => {
    const u: User = {
      id: uIn.id,
      name: uIn.name,
      email: uIn.email,
      password: '',
      role: uIn.role,
      active: true,
      pin: '0000',
    }
    localStorage.setItem(STAFF_SESSION_KEY, u.id)
    localStorage.setItem('polleria-api-user', JSON.stringify(u))
    setApiUser(u)
    await reloadFromApi()
  }

  const logout = () => {
    localStorage.removeItem(STAFF_SESSION_KEY)
    localStorage.removeItem('polleria-api-user')
    setApiToken(null)
    setApiUser(null)
  }

  const can = (module: ModuleId) => {
    if (!user) return false
    return ROLE_MODULES[user.role]?.includes(module) ?? false
  }

  const resetStaffPassword = (email: string, newPassword: string) => {
    const found = state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!found) return false
    saveUser({ ...found, password: newPassword })
    return true
  }

  const api = useMemo<AuthApi>(
    () => ({
      user,
      apiReady: Boolean(getApiToken()),
      loginWithSession,
      logout,
      can,
      resetStaffPassword,
    }),
    [user, state.users],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
