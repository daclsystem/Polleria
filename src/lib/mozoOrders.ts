import type { Order } from '../types'
import { isDeliveryOrder, isPickupOrder, isSalonOrder } from './orderType'
import { orderBelongsToStaff } from './realtime'

export type OrderChannel = 'mesa' | 'recojo' | 'delivery'

export function channelOf(o: Order): OrderChannel {
  if (isSalonOrder(o) || o.tableNumber) return 'mesa'
  if (isPickupOrder(o)) return 'recojo'
  return 'delivery'
}

/** Local pagado, o delivery liquidado en caja, o cancelado → sale del tablero del mozo. */
export function isClosedForMozo(o: Order) {
  if (o.status === 'cancelado') return true
  if (isDeliveryOrder(o)) return Boolean(o.driverSettledAt)
  return o.paid === true
}

export function todayYmd() {
  return toYmd(new Date())
}

export function toYmd(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function orderYmd(iso: string) {
  return toYmd(new Date(iso))
}

export function inDayRange(iso: string, from: string, to: string) {
  const d = orderYmd(iso)
  return d >= from && d <= to
}

export function mozoSeesActive(o: Order, user: { id?: string; name?: string } | null | undefined) {
  if (isClosedForMozo(o)) return false
  if (orderBelongsToStaff(o, user)) return true
  if (isDeliveryOrder(o)) return true
  if (isPickupOrder(o)) return true
  if (isSalonOrder(o) && o.source === 'web') return true
  return false
}

export function mozoSeesHistory(o: Order, user: { id?: string; name?: string } | null | undefined) {
  return isClosedForMozo(o) && orderBelongsToStaff(o, user)
}
