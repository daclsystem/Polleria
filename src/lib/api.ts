/** Base URL del API remoto (VPS). */
const FALLBACK_API = 'https://apipchifapollerialopez.indevsoft.com'

export const API_URL = (
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  FALLBACK_API
).replace(/\/$/, '')

export function apiUrl(path: string) {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
}
