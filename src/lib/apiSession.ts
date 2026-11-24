const TOKEN_KEYS = {
  staff: 'polleria-token-staff',
  driver: 'polleria-token-driver',
  customer: 'polleria-token-customer',
} as const

export type TokenScope = keyof typeof TOKEN_KEYS

const LEGACY_TOKEN = 'polleria-api-token'

export function getApiToken(scope: TokenScope = 'staff') {
  const token = localStorage.getItem(TOKEN_KEYS[scope])
  if (token) return token
  if (scope === 'staff') {
    const legacy = localStorage.getItem(LEGACY_TOKEN)
    if (legacy) {
      localStorage.setItem(TOKEN_KEYS.staff, legacy)
      localStorage.removeItem(LEGACY_TOKEN)
      return legacy
    }
  }
  return null
}

export function setApiToken(token: string | null, scope: TokenScope = 'staff') {
  if (token) localStorage.setItem(TOKEN_KEYS[scope], token)
  else localStorage.removeItem(TOKEN_KEYS[scope])
  if (scope === 'staff') localStorage.removeItem(LEGACY_TOKEN)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('polleria-auth', { detail: { token: Boolean(token), scope } }))
  }
}

/** Un 401 de una petición anterior no debe cerrar una sesión recién iniciada. */
export function handleApiAuthError(
  status: number,
  requestToken: string | null,
  scope: TokenScope,
  error: { code?: string; error?: string },
) {
  if (status !== 401 || !requestToken || requestToken !== getApiToken(scope)) return
  setApiToken(null, scope)
  if (typeof window === 'undefined') return
  const replaced = error.code === 'SESSION_REPLACED'
  window.dispatchEvent(new CustomEvent(replaced ? 'polleria-session-replaced' : 'polleria-session-expired', {
    detail: {
      scope,
      message: replaced ? error.error : 'Tu sesión venció o ya no es válida. Vuelve a iniciar sesión.',
    },
  }))
}
