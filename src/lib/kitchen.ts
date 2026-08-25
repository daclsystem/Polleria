import type { OrderItem, Product } from '../types'

const NO_KITCHEN_CAT = /bebida|gaseosas?|refresco|jugo|agua|cerveza|vino|trago|licor/i

/**
 * Configuración del producto: ¿va a comanda de cocina / preparación?
 * Prioridad: flag sendToKitchen del producto (carta). Fallback: categoría.
 */
export function productGoesToKitchen(
  p?: Pick<Product, 'category' | 'prepMinutes' | 'sendToKitchen'> | null,
) {
  if (!p) return false
  if (typeof p.sendToKitchen === 'boolean') return p.sendToKitchen
  if (NO_KITCHEN_CAT.test(p.category || '')) return false
  if (typeof p.prepMinutes === 'number' && p.prepMinutes <= 0) return false
  return true
}

export function itemGoesToKitchen(item: OrderItem, products: Product[]) {
  if (!item.productId || item.productId === 'delivery') return false
  if (/^delivery$/i.test(item.name) || /delivery|envio|envío/i.test(item.name)) return false
  const p = products.find((x) => x.id === item.productId)
  return productGoesToKitchen(p)
}

export function filterKitchenItems(items: OrderItem[], products: Product[]) {
  return items.filter((item) => itemGoesToKitchen(item, products))
}

/** Default al crear producto según categoría */
export function defaultSendToKitchen(category: string) {
  return !NO_KITCHEN_CAT.test(category || '')
}
