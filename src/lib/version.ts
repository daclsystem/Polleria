/** Versión publicada de todas las apps (web, system, driver, cliente).
 *  Al cambiarla y hacer build, los clientes detectan el cambio y se actualizan. */
export const APP_VERSION = '1.6.30'
export const APP_BUILD = '2026.09.02c'

/** true si `remote` es semver estrictamente mayor que `current`. */
export function isNewerVersion(remote: string, current: string): boolean {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const a = parts(remote)
  const b = parts(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}
