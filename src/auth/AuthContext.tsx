import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../store/StoreContext'
import type { ModuleId, Role, User } from '../types'
import { ROLE_MODULES } from '../types'
import { apiFetch, apiLogout, getApiToken, setApiToken } from '../lib/apiClient'
import { APP_NAME, siteUrl } from '../lib/paths'
import { defaultAvatarUrl } from '../lib/avatar'
import { SessionReplacedDialog } from '../components/SessionReplacedDialog'

const STAFF_SESSION_KEY = 'polleria-staff-session'
const VIEW_KEY = 'polleria-staff-view'

function isRole(v: string | null): v is Role {
  return v === 'admin' || v === 'cajero' || v === 'cocina' || v === 'mozo'
}

function readStoredView(): Role | null {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return isRole(v) ? v : null
  } catch {
    return null
  }
}

interface AuthApi {
  user: User | null
  /** Rol con el que se ve el POS (el admin de sistema puede cambiarlo). */
  actingRole: Role
  needsViewPick: boolean
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
  setViewRole: (role: Role) => void
  patchSessionUser: (partial: Partial<Pick<User, 'name' | 'photoUrl' | 'phone' | 'pin'>>) => void
  logout: () => void
  can: (module: ModuleId) => boolean
  resetStaffPassword: (email: string, newPassword: string) => boolean
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state, saveUser, reloadFromApi } = useStore()
  const [replacedMsg, setReplacedMsg] = useState<string | null>(null)
  const [apiUser, setApiUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('polleria-api-user')
      return raw ? (JSON.parse(raw) as User) : null
    } catch {
      return null
    }
  })
  const [viewRole, setViewRoleState] = useState<Role | null>(() => readStoredView())

  const user = apiUser
  const actingRole: Role = user?.isSystem ? viewRole || 'admin' : user?.role || 'admin'
  const needsViewPick = Boolean(user?.isSystem && !viewRole)

  const logout = () => {
    void apiLogout('staff')
    localStorage.removeItem(STAFF_SESSION_KEY)
    localStorage.removeItem('polleria-api-user')
    localStorage.removeItem(VIEW_KEY)
    setApiToken(null, 'staff')
    setApiUser(null)
    setViewRoleState(null)
  }

  const setViewRole = (role: Role) => {
    localStorage.setItem(VIEW_KEY, role)
    setViewRoleState(role)
    window.dispatchEvent(new Event('polleria-view-role'))
  }

  const patchSessionUser = (partial: Partial<Pick<User, 'name' | 'photoUrl' | 'phone' | 'pin'>>) => {
    setApiUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...partial }
      try {
        localStorage.setItem('polleria-api-user', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
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
    if (u.isSystem) {
      localStorage.removeItem(VIEW_KEY)
      setViewRoleState(null)
    } else {
      localStorage.setItem(VIEW_KEY, u.role)
      setViewRoleState(u.role)
    }
    setApiUser(u)
    await reloadFromApi()
  }

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
      logout()
      setReplacedMsg(detail?.message || 'Iniciaste sesión en otro celular o computadora. Esta queda cerrada.')
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
    const role = user.isSystem ? viewRole || 'admin' : user.role
    if (user.isSystem && !viewRole) return false
    return ROLE_MODULES[role]?.includes(module) ?? false
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
      actingRole,
      needsViewPick,
      apiReady: Boolean(getApiToken('staff')),
      loginWithSession,
      setViewRole,
      patchSessionUser,
      logout,
      can,
      resetStaffPassword,
    }),
    [user, viewRole, state.users, actingRole, needsViewPick],
  )

  return (
    <AuthContext.Provider value={api}>
      {children}
      <SessionReplacedDialog
        open={Boolean(replacedMsg)}
        message={replacedMsg || undefined}
        onAck={() => {
          setReplacedMsg(null)
          window.location.assign(siteUrl('system', '/login'))
        }}
      />
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
