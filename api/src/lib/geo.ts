/** Cliente geo.taximonterrico.com — ruta, geocoding y búsqueda de dirección */

const GEO_BASE = (process.env.GEO_BASE_URL || 'https://geo.taximonterrico.com').replace(/\/$/, '')
const GEO_TOKEN = process.env.GEO_ROUTE_TOKEN || process.env.GEO_TOKEN || 'demo'

export type GeoPoint = { lat: number; lng: number }

export type GeoRouteResult = {
  timeMin: number
  distanceKm: number
  route: GeoPoint[]
  raw?: unknown
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

function routeUrl(from: GeoPoint, to: GeoPoint, token = GEO_TOKEN) {
  const template =
    process.env.GEO_ROUTE_URL ||
    `${GEO_BASE}/api/v3/route/{fromLat},{fromLng}/{toLat},{toLng}/-1/{token}`
  return template
    .replace('{fromLat}', String(from.lat))
    .replace('{fromLng}', String(from.lng))
    .replace('{toLat}', String(to.lat))
    .replace('{toLng}', String(to.lng))
    .replace('{token}', token)
}

function geocodeUrl(lat: number, lng: number, token = GEO_TOKEN) {
  const template =
    process.env.GEO_GEOCODE_URL || `${GEO_BASE}/api/v3/geocoding/{lat},{lng}/0/{token}`
  return template
    .replace('{lat}', String(lat))
    .replace('{lng}', String(lng))
    .replace('{token}', token)
}

function placeUrl(query: string, token = GEO_TOKEN) {
  const template = process.env.GEO_PLACE_URL || `${GEO_BASE}/api/v3/place/{query}/0/{token}`
  return template.replace('{query}', encodeURIComponent(query)).replace('{token}', token)
}

export async function geoRoute(from: GeoPoint, to: GeoPoint, token?: string): Promise<GeoRouteResult> {
  const url = routeUrl(from, to, token || GEO_TOKEN)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Ruta geo HTTP ${res.status}`)
  const data = (await res.json()) as {
    time?: number
    distance?: number
    route?: { lat: number; lng: number }[]
    status?: number
  }
  if (data.status && data.status !== 200) throw new Error(`Ruta geo status ${data.status}`)
  return {
    timeMin: Number(data.time) || 0,
    distanceKm: Number(data.distance) || 0,
    route: Array.isArray(data.route) ? data.route.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })) : [],
    raw: data,
  }
}

export async function geoGeocode(lat: number, lng: number, token?: string): Promise<GeoGeocodeResult> {
  const url = geocodeUrl(lat, lng, token || GEO_TOKEN)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`)
  const data = (await res.json()) as {
    address?: string
    street?: string
    district?: string
    status?: number
  }
  if (data.status && data.status !== 200) throw new Error(`Geocoding status ${data.status}`)
  return {
    address: String(data.address || '').trim(),
    street: data.street ? String(data.street) : undefined,
    district: data.district ? String(data.district) : undefined,
  }
}

export async function geoPlaceSearch(query: string, token?: string): Promise<GeoPlaceMatch[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const url = placeUrl(q, token || GEO_TOKEN)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Place HTTP ${res.status}`)
  const data = (await res.json()) as {
    coincidencias?: Array<{ direccion?: string; distrito?: string; lat?: number; lng?: number }>
    status?: number
  }
  const list = Array.isArray(data.coincidencias) ? data.coincidencias : []
  return list
    .map((c) => ({
      address: String(c.direccion || '').trim(),
      district: String(c.distrito || '').trim(),
      lat: Number(c.lat),
      lng: Number(c.lng),
    }))
    .filter((c) => c.address && Number.isFinite(c.lat) && Number.isFinite(c.lng))
}
