import { getPool, sql } from '../db.js'
import { normalizePhone, sendWhatsAppText } from './wspgo.js'

const FRONT_URL = (process.env.FRONT_PUBLIC_URL || 'https://chifapollerialopez.com').replace(/\/$/, '')

function soles(n: number) {
  return `S/ ${Number(n).toFixed(2)}`
}

export function trackingUrl(orderId: string, phone?: string) {
  const q = phone ? `?tel=${encodeURIComponent(normalizePhone(phone).slice(-9))}` : ''
  return `${FRONT_URL}/seguimiento/${orderId}${q}`
}

async function sendText(phone: string, text: string) {
  await sendWhatsAppText(phone, text)
}

type WaCfg = {
  enabled?: boolean
  notifyPhone?: string
  autoNotifyLocal?: boolean
  autoNotifyCustomer?: boolean
}

async function loadWaConfig(): Promise<WaCfg> {
  try {
    const pool = await getPool()
    const r = await pool
      .request()
      .input('key', sql.NVarChar, 'whatsapp')
      .query(`SELECT ConfigValue FROM dbo.AppConfig WHERE ConfigKey=@key`)
    const raw = r.recordset[0]?.ConfigValue
    if (!raw) return {}
    return JSON.parse(String(raw)) as WaCfg
  } catch {
    return {}
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

/** Aviso al crear pedido: local + cliente (cliente solo delivery / web). En paralelo. */
export async function notifyOrderCreatedServer(order: OrderLike) {
  const cfg = await loadWaConfig()
  if (cfg.enabled === false) return { sent: false, reason: 'whatsapp deshabilitado' }

  const phone = String(order.CustomerPhone || '')
  const track = phone ? trackingUrl(String(order.Id), phone) : ''
  const pago = order.CodPaymentMethod || 'contra entrega'
  const jobs: Promise<unknown>[] = []

  if (cfg.autoNotifyLocal !== false && cfg.notifyPhone) {
    const localText =
      `🔔 *Nuevo pedido #${order.Number}*\n` +
      `Cliente: ${order.CustomerName}\n` +
      `Tel: ${phone || '—'}\n` +
      `${tipoLabel(String(order.Type), order.Address)}\n` +
      `Total: *${soles(Number(order.Total))}*\n` +
      `Pago: ${pago}\n\n` +
      `${detalle(order)}`
    jobs.push(sendText(cfg.notifyPhone, localText))
  }

  const notifyCustomer =
    cfg.autoNotifyCustomer !== false && shouldNotifyCustomerWhatsApp(order) && Boolean(phone)
  if (notifyCustomer) {
    const text =
      `🍗 *Chifa-Pollería Lopez*\n` +
      `¡Hola ${order.CustomerName}! Tu pedido *#${order.Number}* fue recibido.\n\n` +
      `*Detalle:*\n${detalle(order)}\n\n` +
      `Total: *${soles(Number(order.Total))}*\n` +
      `Pago: ${pago}\n` +
      `${tipoLabel(String(order.Type), order.Address)}\n\n` +
      `📍 *Sigue tu pedido aquí:*\n${track}\n\n` +
      `Te avisaremos cuando esté *listo* y cuando se *entregue*.`
    jobs.push(sendText(phone, text))
  }

  if (!jobs.length) {
    return { sent: false, reason: 'nada que enviar' }
  }

  const results = await Promise.allSettled(jobs)
  const ok = results.some((r) => r.status === 'fulfilled')
  for (const r of results) {
    if (r.status === 'rejected') console.warn('[whatsapp] create', r.reason)
  }

  if (ok && notifyCustomer) {
    try {
      const pool = await getPool()
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, order.Id)
        .query(`UPDATE dbo.Orders SET WhatsAppNotifiedAt = SYSUTCDATETIME() WHERE Id = @id`)
    } catch {
      /* ignore */
    }
  }

  return { sent: ok, track: track || undefined }
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

  const headline = STATUS_MSG[status] || `Estado: *${status}*`
  const extra =
    status === 'listo' && (order.Type === 'delivery' || order.Type === 'web')
      ? '\n🛵 Va en camino / listo para salir.'
      : status === 'listo' && order.Type === 'llevar'
        ? '\n🏪 Ya puedes pasar a recogerlo.'
        : ''

  const showTrack = status !== 'entregado' && status !== 'cancelado'
  const track = showTrack ? trackingUrl(String(order.Id), phone) : ''
  const trackLine = showTrack ? `\n\n📍 Tracking:\n${track}` : ''

  const text =
    `🍗 *Chifa-Pollería Lopez*\n` +
    `Pedido *#${order.Number}*\n\n` +
    `${headline}${extra}${trackLine}`

  await sendText(phone, text)
  return { sent: true, track: track || undefined }
}

export function ratingUrl(orderId: string, phone?: string) {
  const q = phone ? `?tel=${encodeURIComponent(normalizePhone(phone).slice(-9))}` : ''
  return `${FRONT_URL}/calificar/${orderId}${q}`
}

/** Gracias al cobrar: todos los pedidos con celular (mesa, recojo o delivery). */
export async function notifyOrderPaidServer(order: OrderLike) {
  const cfg = await loadWaConfig()
  if (cfg.enabled === false) return { sent: false, reason: 'whatsapp deshabilitado' }
  if (cfg.autoNotifyCustomer === false) return { sent: false, reason: 'avisos al cliente apagados' }

  const phone = String(order.CustomerPhone || '')
  if (!phone) return { sent: false, reason: 'sin teléfono' }

  const rate = ratingUrl(String(order.Id), phone)
  const carta = `${FRONT_URL}/`
  const mesa =
    order.Type === 'salon'
      ? 'en mesa'
      : order.Type === 'llevar'
        ? 'para llevar'
        : 'por delivery'

  const text =
    `🍗 *Chifa-Pollería Lopez*\n` +
    `¡Gracias ${order.CustomerName}! 💛\n\n` +
    `Ya registramos el pago de tu pedido *#${order.Number}* (${mesa})\n` +
    `Total: *${soles(Number(order.Total))}*\n\n` +
    `Esperamos que el pollo y el chifa te hayan sabido a gloria.\n` +
    `La próxima te esperamos con el mismo sazón — pide por la web o WhatsApp y te llega más rápido.\n\n` +
    `⭐ *Califícanos (1 minuto):*\n${rate}\n\n` +
    `🛒 *Pide de nuevo:*\n${carta}\n\n` +
    `📍 Chocos Imperial, Cañete\n` +
    `🕚 11:00 – 23:00\n` +
    `WhatsApp: 962 797 752`

  try {
    await sendText(phone, text)
    return { sent: true, track: rate }
  } catch (e) {
    console.warn('[whatsapp] paid', (e as Error).message)
    return { sent: false, reason: (e as Error).message }
  }
}
