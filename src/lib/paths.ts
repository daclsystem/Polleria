/** App actual del build (`web` | `system` | `driver` | `cliente`) */
export const APP_NAME = (import.meta.env.VITE_APP || 'web') as
  | 'web'
  | 'system'
  | 'driver'
  | 'cliente'

export const BASE_URL = import.meta.env.BASE_URL || '/'
/** Basename para React Router ('' en raíz). */
export const BASENAME = BASE_URL.replace(/\/$/, '')

const APP_BASE: Record<typeof APP_NAME, string> = {
  web: '',
  system: '/system',
  driver: '/driver',
  cliente: '/cliente',
}

/** Puertos Vite en local (cada app es un server). */
const DEV_PORTS: Record<typeof APP_NAME, number> = {
  web: 5174,
  system: 5175,
  driver: 5176,
  cliente: 5177,
}

export function withBase(path: string) {
  const clean = path.replace(/^\//, '')
  return `${BASE_URL}${clean}`
}

/** URL absoluta entre apps (mismo dominio, carpetas distintas). */
export function siteUrl(app: keyof typeof APP_BASE, path = '/') {
  const fallbackOrigin = 'https://chifapollerialopez.com'
  let origin = fallbackOrigin
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (import.meta.env.DEV) {
      origin = `${window.location.protocol}//${window.location.hostname}:${DEV_PORTS[app]}`
    } else {
      origin = window.location.origin
    }
  }
  const base = APP_BASE[app]
  const p = path.startsWith('/') ? path : `/${path}`
  if (p === '/') return `${origin}${base}/`
  return `${origin}${base}${p}`
}

/** App de pedidos del cliente. Opcional: abrir un producto al llegar. */
export function customerMenuUrl(opts?: { productId?: string }) {
  const base = siteUrl('cliente', '/')
  if (opts?.productId) {
    return `${base}?producto=${encodeURIComponent(opts.productId)}`
  }
  return base
}

export function webTrackingUrl(orderId: string, phone?: string) {
  const q = phone ? `?tel=${encodeURIComponent(phone)}` : ''
  return siteUrl('web', `/seguimiento/${orderId}${q}`)
}
