/** Avatar por defecto (ui-avatars) según rol / tipo de cuenta */
export function defaultAvatarUrl(
  name: string,
  tone: 'staff' | 'customer' | 'driver' = 'staff',
) {
  const n = encodeURIComponent(name || 'Usuario')
  const bg = tone === 'customer' ? '1a3d1a' : tone === 'driver' ? '0f766e' : 'e11d2e'
  const color = tone === 'customer' ? 'ffd700' : 'ffffff'
  return `https://ui-avatars.com/api/?name=${n}&background=${bg}&color=${color}&size=128&bold=true`
}

/** ID corto legible a partir del GUID */
export function shortAccountId(id?: string | null) {
  if (!id) return '—'
  const clean = id.replace(/-/g, '')
  return clean.slice(-8).toUpperCase()
}
