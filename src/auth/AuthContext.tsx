import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../store/StoreContext'
import type { ModuleId, Role, User } from '../types'
import { ROLE_MODULES } from '../types'
import { apiLogin, getApiToken, setApiToken } from '../lib/apiClient'

/** Sesión staff (solo token/sesión, datos de negocio vienen del API) */
const STAFF_SESSION_KEY = 'polleria-staff-session'

interface AuthApi {
  user: User | null
  apiReady: boolean
  login: (email: string, password: string) => Promise<string | null>
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

  const login = async (email: string, password: string) => {
    try {
      const data = await apiLogin(email, password)
      const u: User = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        password: '',
        role: data.user.role as Role,
        active: true,
        pin: '0000',
      }
      localStorage.setItem(STAFF_SESSION_KEY, u.id)
      localStorage.setItem('polleria-api-user', JSON.stringify(u))
      setApiUser(u)
      await reloadFromApi()
      return null
    } catch (e) {
      return (e as Error).message || 'No se pudo iniciar sesión en el API'
    }
  }

  const logout = () => {
    localStorage.removeItem(STAFF_SESSION_KEY)
    localStorage.removeItem('polleria-api-user')
    setApiToken(null)
    setApiUser(null)
  }

  const can = (module: ModuleId) => {
    if (!user) return false
    return ROLE_MODULES[user.role].includes(module)
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
      login,
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
