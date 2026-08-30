import type { DriverDeliveryOrder } from './apiClient'

export const DRIVER_KEY = 'polleria-driver-session'

export type DriverSession = {
  id: string
  name: string
  phone: string
  vehicleInfo?: string
  photoUrl?: string
}

export function loadDriverSession(): DriverSession | null {
  try {
    const raw = localStorage.getItem(DRIVER_KEY)
    return raw ? (JSON.parse(raw) as DriverSession) : null
  } catch {
    return null
  }
}

export function digitsPhone(phone?: string | null) {
  return String(phone || '').replace(/\D/g, '')
}

export function whatsappPhone(phone?: string | null) {
  let d = digitsPhone(phone)
  if (d.length === 9 && d.startsWith('9')) d = `51${d}`
  return d
}

export type DriverAction = 'ubicado' | 'entregado' | 'liquidar' | 'listo'

export function driverAction(o: DriverDeliveryOrder): DriverAction {
  if (o.driverSettledAt) return 'listo'
  if (o.status === 'entregado' && o.paid) return 'listo'
  if (o.status === 'entregado') return 'liquidar'
  if (o.driverArrivedAt) return 'entregado'
  return 'ubicado'
}

export const FLOW_STEPS = [
  { key: 'en_camino', label: 'En camino' },
  { key: 'ubicado', label: 'Ubicado' },
  { key: 'entregado', label: 'Entregado' },
  { key: 'liquidar', label: 'Liquidar' },
] as const

export const STORE_COORDS: [number, number] = [-13.1083, -76.0114]
export const OSM_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
