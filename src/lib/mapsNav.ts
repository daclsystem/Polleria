import { getDeviceOS, type DeviceOS } from './platform'

export type NavPoint = {
  lat?: number | null
  lng?: number | null
  address?: string | null
}

export type NavApp = 'google' | 'waze' | 'apple'

function hasCoords(p: NavPoint) {
  return p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)
}

/** Destino como texto o coords para URLs. */
function destinationParam(p: NavPoint): string | null {
  if (hasCoords(p)) return `${p.lat},${p.lng}`
  if (p.address?.trim()) return p.address.trim()
  return null
}

/** Google Maps directions (web / app). */
export function buildGoogleMapsUrl(
  dest: NavPoint,
  opts?: { origin?: NavPoint; waypoints?: NavPoint[] },
): string | null {
  const destStr = destinationParam(dest)
  if (!destStr) return null
  const params = new URLSearchParams({ api: '1', travelmode: 'driving' })
  params.set('destination', destStr)
  const originStr = opts?.origin ? destinationParam(opts.origin) : null
  if (originStr) params.set('origin', originStr)
  const mids = (opts?.waypoints || [])
    .map((s) => destinationParam(s))
    .filter(Boolean) as string[]
  if (mids.length) params.set('waypoints', mids.join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/**
 * Waze: navega al punto.
 * Multi-parada no está bien soportada → usa el primer destino / destino final.
 */
export function buildWazeUrl(dest: NavPoint): string | null {
  if (hasCoords(dest)) {
    return `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`
  }
  if (dest.address?.trim()) {
    return `https://waze.com/ul?q=${encodeURIComponent(dest.address.trim())}&navigate=yes`
  }
  return null
}

/** Apple Maps (iOS). */
export function buildAppleMapsUrl(dest: NavPoint): string | null {
  const destStr = destinationParam(dest)
  if (!destStr) return null
  if (hasCoords(dest)) {
    return `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=d`
  }
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destStr)}&dirflg=d`
}

/**
 * Abre navegación nativa según SO (compat):
 * - iOS → Apple Maps
 * - Android → geo:
 * - Desktop → Google Maps
 */
export function buildNavigationUrl(
  dest: NavPoint,
  opts?: { origin?: NavPoint; label?: string; os?: DeviceOS },
): string | null {
  const os = opts?.os ?? getDeviceOS()
  if (os === 'ios') return buildAppleMapsUrl(dest)
  if (os === 'android') {
    const label = encodeURIComponent(opts?.label || 'Entrega')
    if (hasCoords(dest)) {
      return `geo:${dest.lat},${dest.lng}?q=${dest.lat},${dest.lng}(${label})`
    }
    const destStr = destinationParam(dest)
    if (!destStr) return null
    return `geo:0,0?q=${encodeURIComponent(destStr)}`
  }
  return buildGoogleMapsUrl(dest, { origin: opts?.origin })
}

/** Ruta multi-parada en Google Maps. */
export function buildMultiStopUrl(
  origin: NavPoint,
  stops: NavPoint[],
  _os: DeviceOS = getDeviceOS(),
): string | null {
  if (!stops.length) return null
  const dest = stops[stops.length - 1]
  const mid = stops.slice(0, -1)
  return buildGoogleMapsUrl(dest, { origin, waypoints: mid })
}

/** Waze al primer / único destino de la lista. */
export function buildWazeForStops(stops: NavPoint[]): string | null {
  const first = stops.find((s) => hasCoords(s) || s.address?.trim())
  return first ? buildWazeUrl(first) : null
}

export function openNavigation(dest: NavPoint, opts?: { origin?: NavPoint; label?: string }) {
  const url = buildNavigationUrl(dest, opts)
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
  return url
}

export function openInApp(app: NavApp, dest: NavPoint, opts?: { origin?: NavPoint }) {
  let url: string | null = null
  if (app === 'waze') url = buildWazeUrl(dest)
  else if (app === 'apple') url = buildAppleMapsUrl(dest)
  else url = buildGoogleMapsUrl(dest, { origin: opts?.origin })
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
  return url
}
