/** Base URL del API remoto (VPS). */
const FALLBACK_API = 'https://apipchifapollerialopez.indevsoft.com'

export const REMOTE_API_URL = (
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  FALLBACK_API
).replace(/\/$/, '')

/**
 * En `vite` (dev) las peticiones van al mismo origen y el proxy de Vite
 * las reenvía al API. Así no pega CORS desde localhost.
 */
export const API_URL = import.meta.env.DEV ? '' : REMOTE_API_URL

export function apiUrl(path: string) {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
}
