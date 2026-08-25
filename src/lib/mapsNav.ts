import { getDeviceOS, type DeviceOS } from './platform'

export type NavPoint = {
  lat?: number | null
  lng?: number | null
  address?: string | null
}

function hasCoords(p: NavPoint) {
  return p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)
}

/** Destino como texto o coords para URLs. */
function destinationParam(p: NavPoint): string | null {
  if (hasCoords(p)) return `${p.lat},${p.lng}`
  if (p.address?.trim()) return p.address.trim()
  return null
}

/**
 * Abre navegación nativa según SO:
 * - iOS → Apple Maps (con fallback Google)
 * - Android → geo: / Google Maps intent
 * - Desktop → Google Maps web
 */
export function buildNavigationUrl(
  dest: NavPoint,
  opts?: { origin?: NavPoint; label?: string; os?: DeviceOS },
): string | null {
  const os = opts?.os ?? getDeviceOS()
  const destStr = destinationParam(dest)
  if (!destStr) return null

  const label = encodeURIComponent(opts?.label || 'Entrega')
  const originStr = opts?.origin ? destinationParam(opts.origin) : null

  if (os === 'ios') {
    // Apple Maps: daddr + dirflg=d (driving)
    const q = hasCoords(dest)
      ? `daddr=${dest.lat},${dest.lng}&dirflg=d`
      : `daddr=${encodeURIComponent(destStr)}&dirflg=d`
    return `https://maps.apple.com/?${q}`
  }

  if (os === 'android') {
    if (hasCoords(dest)) {
      return `geo:${dest.lat},${dest.lng}?q=${dest.lat},${dest.lng}(${label})`
    }
    return `geo:0,0?q=${encodeURIComponent(destStr)}`
  }

  // Desktop / otros → Google Maps directions
  const params = new URLSearchParams({ api: '1', travelmode: 'driving' })
  params.set('destination', destStr)
  if (originStr) params.set('origin', originStr)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Ruta multi-parada (Google Maps web; en móvil abre la app si está instalada). */
export function buildMultiStopUrl(
  origin: NavPoint,
  stops: NavPoint[],
  os: DeviceOS = getDeviceOS(),
): string | null {
  if (!stops.length) return null
  const dest = stops[stops.length - 1]
  const mid = stops.slice(0, -1)
  const destStr = destinationParam(dest)
  if (!destStr) return null

  if (os === 'ios' && stops.length === 1) {
    return buildNavigationUrl(dest, { origin, os })
  }

  const params = new URLSearchParams({ api: '1', travelmode: 'driving' })
  const originStr = destinationParam(origin)
  if (originStr) params.set('origin', originStr)
  params.set('destination', destStr)
  if (mid.length) {
    params.set(
      'waypoints',
      mid
        .map((s) => destinationParam(s))
        .filter(Boolean)
        .join('|'),
    )
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function openNavigation(dest: NavPoint, opts?: { origin?: NavPoint; label?: string }) {
  const url = buildNavigationUrl(dest, opts)
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
  return url
}
