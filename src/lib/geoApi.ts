import { apiUrl } from './api'

export type GeoPoint = { lat: number; lng: number }

export type GeoRouteResult = {
  timeMin: number
  distanceKm: number
  route: GeoPoint[]
}

export type GeoGeocodeResult = {
  address: string
  street?: string
  district?: string
}

export type GeoPlaceMatch = {
  address: string
  district: string
  lat: number
  lng: number
}

const LOC_KEY = 'polleria-last-location'

export function saveLastLocation(coords: GeoPoint & { address?: string }) {
  try {
    sessionStorage.setItem(LOC_KEY, JSON.stringify({ ...coords, at: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function loadLastLocation(): (GeoPoint & { address?: string; at?: number }) | null {
  try {
    const raw = sessionStorage.getItem(LOC_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as GeoPoint & { address?: string; at?: number }
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null
    return p
  } catch {
    return null
  }
}

/** Distancia/tiempo vía API (proxy a geo.taximonterrico.com) */
export async function fetchGeoRoute(from: GeoPoint, to: GeoPoint): Promise<GeoRouteResult> {
  const q = new URLSearchParams({
    fromLat: String(from.lat),
    fromLng: String(from.lng),
    toLat: String(to.lat),
    toLng: String(to.lng),
  })
  const res = await fetch(apiUrl(`/api/geo/route?${q}`))
  if (!res.ok) throw new Error('No se pudo calcular distancia/tiempo')
  return (await res.json()) as GeoRouteResult
}

/** Coordenadas → dirección */
export async function fetchGeoGeocode(lat: number, lng: number): Promise<GeoGeocodeResult> {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  const res = await fetch(apiUrl(`/api/geo/geocode?${q}`))
  if (!res.ok) throw new Error('No se pudo obtener la dirección')
  return (await res.json()) as GeoGeocodeResult
}

/** Búsqueda de dirección (autocomplete) */
export async function fetchGeoPlace(query: string): Promise<GeoPlaceMatch[]> {
  const q = new URLSearchParams({ q: query })
  const res = await fetch(apiUrl(`/api/geo/place?${q}`))
  if (!res.ok) throw new Error('No se pudo buscar dirección')
  const data = (await res.json()) as { matches: GeoPlaceMatch[] }
  return data.matches || []
}

/** Pide GPS al navegador (una vez) */
export function requestBrowserLocation(opts?: {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}): Promise<GeoPoint & { accuracy?: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocalización no disponible'))
      return
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(new Error('La ubicación requiere HTTPS'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }
        saveLastLocation(coords)
        resolve(coords)
      },
      (err) => reject(err),
      {
        enableHighAccuracy: opts?.enableHighAccuracy ?? true,
        timeout: opts?.timeout ?? 20000,
        maximumAge: opts?.maximumAge ?? 10000,
      },
    )
  })
}

/** GPS + reverse geocode (dirección legible) */
export async function requestLocationWithAddress() {
  const coords = await requestBrowserLocation()
  try {
    const geo = await fetchGeoGeocode(coords.lat, coords.lng)
    const withAddr = { ...coords, address: geo.address }
    saveLastLocation(withAddr)
    return withAddr
  } catch {
    return coords
  }
}
