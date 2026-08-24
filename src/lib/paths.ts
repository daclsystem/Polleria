export const BASE_URL = import.meta.env.BASE_URL || '/'
export const BASENAME = BASE_URL.replace(/\/$/, '') || '/'

export function withBase(path: string) {
  const clean = path.replace(/^\//, '')
  return `${BASE_URL}${clean}`
}

export function customerMenuUrl() {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}${withBase('pedir')}`
}
