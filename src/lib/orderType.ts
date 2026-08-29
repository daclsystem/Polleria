import type { Order, OrderType } from '../types'

/** Pedido de mesa / salón */
export function isSalonOrder(o: { type?: OrderType | string }) {
  return o.type === 'salon'
}

/** Recojo en tienda (llamar, POS, web) — el cliente viene al local */
export function isPickupOrder(o: { type?: OrderType | string }) {
  return o.type === 'llevar'
}

/**
 * Delivery a domicilio — requiere repartidor.
 * Nota: pedidos web usan type `delivery` o `llevar` + source `web`.
 * `type === 'web'` solo por datos viejos.
 */
export function isDeliveryOrder(o: { type?: OrderType | string }) {
  return o.type === 'delivery' || o.type === 'web'
}

/** Fuera de mesa: recojo o delivery (teléfono, web, mostrador) */
export function isOffPremiseOrder(o: { type?: OrderType | string }) {
  return isPickupOrder(o) || isDeliveryOrder(o)
}

export function needsDriver(o: Pick<Order, 'type' | 'status' | 'driverId'>) {
  return (
    isDeliveryOrder(o) &&
    !o.driverId &&
    o.status !== 'cancelado' &&
    o.status !== 'entregado'
  )
}
