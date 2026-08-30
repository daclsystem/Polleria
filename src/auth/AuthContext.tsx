import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../store/StoreContext'
import type { ModuleId, Role, User } from '../types'
import { ROLE_MODULES } from '../types'
import { apiFetch, getApiToken, setApiToken } from '../lib/apiClient'
import { APP_NAME, siteUrl } from '../lib/paths'
import { defaultAvatarUrl } from '../lib/avatar'

const STAFF_SESSION_KEY = 'polleria-staff-session'

interface AuthApi {
  user: User | null
  apiReady: boolean
  loginWithSession: (user: {
    id: string
    name: string
    email: string
    role: Role
    pin?: string
    phone?: string
    photoUrl?: string
    isSystem?: boolean
  }) => Promise<void>
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

  const logout = () => {
    localStorage.removeItem(STAFF_SESSION_KEY)
    localStorage.removeItem('polleria-api-user')
    setApiToken(null, 'staff')
    setApiUser(null)
  }

  const loginWithSession = async (uIn: {
    id: string
    name: string
    email: string
    role: Role
    pin?: string
    phone?: string
    photoUrl?: string
    isSystem?: boolean
  }) => {
    const fromCatalog = state.users.find((x) => x.id === uIn.id)
    const u: User = {
      id: uIn.id,
      name: uIn.name,
      email: uIn.email,
      password: '',
      role: uIn.role,
      active: true,
      pin: uIn.pin || fromCatalog?.pin || '0000',
      phone: uIn.phone || fromCatalog?.phone,
      photoUrl:
        uIn.photoUrl ||
        fromCatalog?.photoUrl ||
        defaultAvatarUrl(uIn.name, 'staff'),
      isSystem: Boolean(uIn.isSystem),
    }
    localStorage.setItem(STAFF_SESSION_KEY, u.id)
    localStorage.setItem('polleria-api-user', JSON.stringify(u))
    setApiUser(u)
    await reloadFromApi()
  }

  // Si el bootstrap trae foto/pin actualizados, reflejarlos en la sesión
  useEffect(() => {
    if (!apiUser) return
    const fresh = state.users.find((x) => x.id === apiUser.id)
    if (!fresh) return
    if (
      fresh.photoUrl === apiUser.photoUrl &&
      fresh.pin === apiUser.pin &&
      fresh.name === apiUser.name
    ) {
      return
    }
    const next: User = {
      ...apiUser,
      name: fresh.name,
      pin: fresh.pin,
      phone: fresh.phone,
      photoUrl: fresh.photoUrl || apiUser.photoUrl || defaultAvatarUrl(fresh.name, 'staff'),
    }
    localStorage.setItem('polleria-api-user', JSON.stringify(next))
    setApiUser(next)
  }, [state.users, apiUser?.id])

  useEffect(() => {
    const onReplaced = (ev: Event) => {
      const detail = (ev as CustomEvent<{ scope?: string; message?: string }>).detail
      if (detail?.scope && detail.scope !== 'staff') return
      alert(detail?.message || 'Tu sesión se cerró porque iniciaste en otro dispositivo')
      logout()
      window.location.assign(siteUrl('system', '/login'))
    }
    window.addEventListener('polleria-session-replaced', onReplaced)

    const t = window.setInterval(() => {
      if (APP_NAME !== 'system') return
      if (!getApiToken('staff')) return
      void apiFetch('/api/auth/session', { scope: 'staff' }).catch(() => {})
    }, 20000)

    return () => {
      window.removeEventListener('polleria-session-replaced', onReplaced)
      window.clearInterval(t)
    }
  }, [])

  const can = (module: ModuleId) => {
    if (!user) return false
    /** Admin de sistema: acceso total (Página Web, cupones, etc.) */
    if (user.isSystem) return true
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
      apiReady: Boolean(getApiToken('staff')),
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
