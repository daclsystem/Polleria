import { apiDeliveryQuote } from './apiClient'
import { fetchGeoPlace } from './geoApi'

export type ClientDeliveryQuote = {
  fee: number
  distanceKm: number
  timeMin: number
  lat: number
  lng: number
  address?: string
}

export async function quoteDeliveryAt(lat: number, lng: number): Promise<ClientDeliveryQuote> {
  const q = (await apiDeliveryQuote({ lat, lng })) as {
    fee?: number
    distanceKm?: number
    timeMin?: number
  }
  return {
    fee: Number(q.fee || 0),
    distanceKm: Number(q.distanceKm || 0),
    timeMin: Number(q.timeMin || 0),
    lat,
    lng,
  }
}

export async function quoteDeliveryFromAddress(address: string): Promise<ClientDeliveryQuote> {
  const matches = await fetchGeoPlace(address)
  const first = matches[0]
  if (!first) throw new Error('No se encontró esa dirección')
  const q = await quoteDeliveryAt(first.lat, first.lng)
  return { ...q, address: first.address }
}

export function formatDeliveryQuote(q: Pick<ClientDeliveryQuote, 'distanceKm' | 'timeMin' | 'fee'>) {
  const km = Number.isFinite(q.distanceKm) ? `${q.distanceKm.toFixed(1)} km` : '—'
  const min = Number.isFinite(q.timeMin) ? `~${Math.max(1, Math.round(q.timeMin))} min` : '—'
  return `${km} · ${min}`
}
