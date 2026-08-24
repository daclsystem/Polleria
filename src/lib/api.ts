/** Base URL del API remoto (VPS). OBLIGATORIO — todo el sistema usa API. */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''

if (!API_URL && typeof window !== 'undefined') {
  console.error('[Polleria] VITE_API_URL no configurada. El sistema requiere API.')
}

export function apiUrl(path: string) {
  if (!API_URL) throw new Error('VITE_API_URL no configurada — configura .env.local')
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
}
