import type { Branch, DeliveryRange } from '../types'
import { uid } from './format'

/** Origen principal: https://maps.app.goo.gl/jUTXdLKmq7w3rXXv5 */
export const MAIN_ORIGIN = { lat: -13.064353, lng: -76.348946 }

export function defaultDeliveryRanges(): DeliveryRange[] {
  const rows: Array<{ name: string; from: number; to: number | null; fee: number; active?: boolean }> = [
    { name: '0 a 4 km', from: 0, to: 4, fee: 3 },
    { name: '4 a 6 km', from: 4, to: 6, fee: 6 },
    { name: '6 a 8 km', from: 6, to: 8, fee: 9 },
    { name: '8 a 10 km', from: 8, to: 10, fee: 12 },
    { name: '10 a 12 km', from: 10, to: 12, fee: 15 },
    { name: 'Fuera de cobertura', from: 12, to: null, fee: 0, active: false },
  ]
  return rows.map((r, i) => ({
    id: uid('rng'),
    name: r.name,
    distanceKmFrom: r.from,
    distanceKmTo: r.to,
    fee: r.fee,
    sortOrder: i + 1,
    active: r.active !== false,
  }))
}

export function parseMapsCoords(text: string): { lat: number; lng: number } | null {
  const t = text.trim()
  const at = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) }
  const bang = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (bang) return { lat: Number(bang[1]), lng: Number(bang[2]) }
  const q = t.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (q) return { lat: Number(q[1]), lng: Number(q[2]) }
  const plain = t.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (plain) return { lat: Number(plain[1]), lng: Number(plain[2]) }
  return null
}

export function pickDeliveryBranchId(branches?: Branch[]) {
  const b = (branches || []).find((x) => x.active !== false && x.lat != null && x.lng != null)
  return b?.id
}

export function formatRangeLabel(r: Pick<DeliveryRange, 'distanceKmFrom' | 'distanceKmTo' | 'fee' | 'active'>) {
  const to = r.distanceKmTo == null ? '+' : String(r.distanceKmTo)
  const fee = r.active === false || r.fee <= 0 ? 'sin cobertura' : `S/ ${r.fee}`
  return `${r.distanceKmFrom}–${to} km · ${fee}`
}
