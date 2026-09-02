import type { Order, User } from '../types'

const JUNK = /^(api|pos|web|sistema|cliente|admin)$/i

function looksLikeGuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

/** Nombre para ticket: nunca “api”. Mesa/POS = mozo; app = App del cliente. */
export function staffLabel(order: Order, users: User[] = []): string {
  if (order.createdByUserId) {
    const u = users.find((x) => x.id === order.createdByUserId)
    if (u?.name) return u.name
  }
  const raw = (order.createdBy || '').trim()
  if (raw && !JUNK.test(raw) && !looksLikeGuid(raw)) {
    const byName = users.find((x) => x.name === raw)
    if (byName) return byName.name
    return raw
  }
  if (order.source === 'web') return 'App del cliente'
  return 'Mozo'
}
