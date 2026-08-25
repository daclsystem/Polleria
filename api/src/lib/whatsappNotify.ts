import { getPool, sql } from '../db.js'

const WSP_BASE = process.env.WSPGO_BASE_URL || 'https://iwspgo.indevsoft.com'
const WSP_KEY = process.env.WSPGO_API_KEY || '753ce43470bc2ad5b72bce84a7080d7ec92f77a6690bff51e5e03a5cd14eb6e0'
const WSP_SESSION = process.env.WSPGO_SESSION || 'PolleriaLopez'
const FRONT_URL = (process.env.FRONT_PUBLIC_URL || 'https://apipchifapollerialopez.indevsoft.com/polleria').replace(/\/$/, '')

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 9 && digits.startsWith('9')) digits = `51${digits}`
  return digits
}

function toChatId(phone: string) {
  const d = normalizePhone(phone)
  return d.includes('@') ? d : `${d}@c.us`
}

function soles(n: number) {
  return `S/ ${Number(n).toFixed(2)}`
}

export function trackingUrl(orderId: string, phone?: string) {
  const q = phone ? `?tel=${encodeURIComponent(normalizePhone(phone).slice(-9))}` : ''
  return `${FRONT_URL}/web/seguimiento/${orderId}${q}`
}

async function sendText(phone: string, text: string) {
  const res = await fetch(`${WSP_BASE.replace(/\/$/, '')}/api/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': WSP_KEY,
    },
    body: JSON.stringify({
      session: WSP_SESSION,
      chatId: toChatId(phone),
      text,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `WhatsApp HTTP ${res.status}`)
  }
}

type OrderLike = {
  Id: string
  Number: number
  Type: string
  Status: string
  CustomerName: string
  CustomerPhone?: string | null
  Address?: string | null
  Total: number
  CodPaymentMethod?: string | null
  Source?: string | null
  items?: Array<{ Name: string; Qty: number; Price: number }>
}

/** WhatsApp al cliente solo: delivery o pedido app/web (no mesa/salón POS) */
export function shouldNotifyCustomerWhatsApp(order: Pick<OrderLike, 'Type' | 'Source'>) {
  const type = String(order.Type || '').toLowerCase()
  const source = String(order.Source || '').toLowerCase()
  if (source === 'web') return true
  if (type === 'delivery' || type === 'web') return true
  return false
}

function detalle(order: OrderLike) {
  const items = order.items || []
  if (!items.length) return '(ver detalle en el enlace)'
  return items.map((i) => `${i.Qty}x ${i.Name}`).join('\n')
}

function tipoLabel(type: string, address?: string | null) {
  if (type === 'delivery' || type === 'web') return address ? `🛵 Delivery\n📍 ${address}` : '🛵 Delivery'
  if (type === 'llevar') return '🏪 Recojo en local'
  return '🍽️ Mesa / salón'
}

/** Solo estos estados generan WhatsApp (máx. ~3 msgs/pedido + cancelación) */
const NOTIFY_STATUSES = new Set(['listo', 'entregado', 'cancelado'])

const STATUS_MSG: Record<string, string> = {
  listo: '🎉 *Listo*\nTu pedido está listo.',
  entregado: '📦 *Entregado*\n¡Buen provecho! Gracias por elegirnos.',
  cancelado: '❌ *Cancelado*\nTu pedido fue cancelado. Si tienes dudas, escríbenos.',
}

/** Aviso al crear pedido: detalle + tracking (mensaje 1/3) — solo delivery / cliente web */
export async function notifyOrderCreatedServer(order: OrderLike) {
  if (!shouldNotifyCustomerWhatsApp(order)) {
    return { sent: false, reason: 'solo delivery o pedido del cliente (app/web)' }
  }

  const phone = String(order.CustomerPhone || '')
  if (!phone) return { sent: false, reason: 'sin teléfono' }

  const track = trackingUrl(String(order.Id), phone)
  const pago = order.CodPaymentMethod || 'contra entrega'
  const text =
    `🍗 *Chifa-Pollería Lopez*\n` +
    `¡Hola ${order.CustomerName}! Tu pedido *#${order.Number}* fue recibido.\n\n` +
    `*Detalle:*\n${detalle(order)}\n\n` +
    `Total: *${soles(Number(order.Total))}*\n` +
    `Pago: ${pago}\n` +
    `${tipoLabel(String(order.Type), order.Address)}\n\n` +
    `📍 *Sigue tu pedido aquí:*\n${track}\n\n` +
    `Te avisaremos cuando esté *listo* y cuando se *entregue*.`

  await sendText(phone, text)

  try {
    const pool = await getPool()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, order.Id)
      .query(`UPDATE dbo.Orders SET WhatsAppNotifiedAt = SYSUTCDATETIME() WHERE Id = @id`)
  } catch {
    /* ignore */
  }

  return { sent: true, track }
}

/**
 * Aviso de estado (mensajes 2–3) — solo delivery / cliente web
 */
export async function notifyOrderStatusServer(order: OrderLike, status: string) {
  if (!shouldNotifyCustomerWhatsApp(order)) {
    return { sent: false, reason: 'solo delivery o pedido del cliente (app/web)' }
  }

  if (!NOTIFY_STATUSES.has(status)) {
    return { sent: false, reason: `estado ${status} omitido (anti-spam)` }
  }

  const phone = String(order.CustomerPhone || '')
  if (!phone) return { sent: false, reason: 'sin teléfono' }

  const track = trackingUrl(String(order.Id), phone)
  const headline = STATUS_MSG[status] || `Estado: *${status}*`
  const extra =
    status === 'listo' && (order.Type === 'delivery' || order.Type === 'web')
      ? '\n🛵 Va en camino / listo para salir.'
      : status === 'listo' && order.Type === 'llevar'
        ? '\n🏪 Ya puedes pasar a recogerlo.'
        : ''

  const text =
    `🍗 *Chifa-Pollería Lopez*\n` +
    `Pedido *#${order.Number}*\n\n` +
    `${headline}${extra}\n\n` +
    `📍 Tracking:\n${track}`

  await sendText(phone, text)
  return { sent: true, track }
}
