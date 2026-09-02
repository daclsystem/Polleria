/** Iniciales: ignora “de/del/el…” para que “Administrador de sistema” sea AS, no SI. */
export function initialsFromName(name: string): string {
  const skip = new Set([
    'de',
    'del',
    'la',
    'el',
    'los',
    'las',
    'y',
    'da',
    'do',
    'dos',
    'e',
    'the',
    'of',
    'sistema',
    'system',
  ])
  const parts = (name || 'Usuario')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[\s,._-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !skip.has(w.toLowerCase()))
  if (parts.length === 0) return 'US'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function svgAvatar(initials: string, bg: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="64" fill="#${bg}"/>
    <text x="64" y="80" text-anchor="middle" font-family="Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif" font-size="48" font-weight="800" fill="#${color}">${initials}</text>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Avatar por defecto (SVG local, sin ui-avatars). */
export function defaultAvatarUrl(
  name: string,
  tone: 'staff' | 'customer' | 'driver' = 'staff',
) {
  const bg = tone === 'customer' ? '1a3d1a' : tone === 'driver' ? '0f766e' : '1a3d1a'
  const color = tone === 'driver' ? 'ffffff' : 'ffd700'
  return svgAvatar(initialsFromName(name), bg, color)
}

export function isPlaceholderAvatar(url?: string | null) {
  if (!url) return true
  return (
    url.includes('ui-avatars.com') ||
    url.startsWith('data:') ||
    url.includes('googleusercontent') && url.includes('avatar')
  )
}

/** URL de foto real para persistir (MinIO). Los SVG/ui-avatars no se guardan. */
export function realPhotoUrl(url?: string | null): string | undefined {
  const v = (url || '').trim()
  if (!v || isPlaceholderAvatar(v) || !/^https?:\/\//i.test(v)) return undefined
  return v
}

/** Foto real si hay; si es placeholder o ui-avatars, regenera iniciales correctas. */
export function displayAvatarUrl(
  name: string,
  photoUrl?: string | null,
  tone: 'staff' | 'customer' | 'driver' = 'staff',
) {
  if (photoUrl && !photoUrl.includes('ui-avatars.com') && !photoUrl.startsWith('data:image/svg+xml')) {
    return photoUrl
  }
  return defaultAvatarUrl(name, tone)
}

/** ID corto legible a partir del GUID */
export function shortAccountId(id?: string | null) {
  if (!id) return '—'
  const clean = id.replace(/-/g, '')
  return clean.slice(-8).toUpperCase()
}
