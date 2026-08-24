import type { Order } from '../types'
import { soles } from './format'
import { apiGetWhatsappConfig, apiSaveWhatsappConfig, getApiToken } from './apiClient'

export interface WspgoConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  session: string
  /** Número del local para avisar pedidos nuevos (con código país) */
  notifyPhone: string
  autoNotifyCustomer: boolean
  autoNotifyLocal: boolean
  templates: {
    pedidoRecibido: string
    pedidoListo: string
    pedidoEnCamino: string
    avisoLocal: string
  }
}

export const DEFAULT_WSPGO: WspgoConfig = {
  enabled: true,
  baseUrl: 'https://iwspgo.indevsoft.com',
  apiKey: '753ce43470bc2ad5b72bce84a7080d7ec92f77a6690bff51e5e03a5cd14eb6e0',
  session: 'PolleriaLopez',
  notifyPhone: '51962797752',
  autoNotifyCustomer: true,
  autoNotifyLocal: true,
  templates: {
    pedidoRecibido:
      '¡Hola {nombre}! 👋 Tu pedido #{numero} ha sido recibido.\n\n*{detalle}*\n\nTotal: *{total}*\nPago: {pago}\n\nLo estamos preparando. 🍗\n— Chifa-Pollería Lopez',
    pedidoListo:
      '¡{nombre}! Tu pedido #{numero} está *LISTO* 🎉\n\n{tipo_entrega}\n\nGracias por elegirnos.\n— Chifa-Pollería Lopez',
    pedidoEnCamino:
      '🛵 ¡{nombre}! Tu pedido #{numero} va en camino.\nDirección: {direccion}\n\n— Chifa-Pollería Lopez',
    avisoLocal:
      '🔔 *Nuevo pedido #{numero}*\nCliente: {nombre}\nTel: {telefono}\nTipo: {tipo}\nTotal: {total}\nPago: {pago}\n\n{detalle}\n{direccion_line}',
  },
}

let cachedConfig: WspgoConfig | null = null

export function loadWspgoConfig(): WspgoConfig {
  if (!cachedConfig) return { ...DEFAULT_WSPGO }
  return {
    ...DEFAULT_WSPGO,
    ...cachedConfig,
    templates: { ...DEFAULT_WSPGO.templates, ...cachedConfig.templates },
  }
}

export async function fetchWspgoConfig(): Promise<WspgoConfig> {
  if (!getApiToken()) return loadWspgoConfig()
  try {
    const { config } = await apiGetWhatsappConfig()
    if (config && typeof config === 'object') {
      const c = config as WspgoConfig
      cachedConfig = {
        ...DEFAULT_WSPGO,
        ...c,
        templates: { ...DEFAULT_WSPGO.templates, ...(c.templates || {}) },
      }
      return cachedConfig
    }
  } catch {
    /* ignore */
  }
  return loadWspgoConfig()
}

export async function saveWspgoConfig(config: WspgoConfig) {
  cachedConfig = config
  await apiSaveWhatsappConfig(config)
}

export function toChatId(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 9 && digits.startsWith('9')) digits = `51${digits}`
  if (!digits.endsWith('@c.us') && !digits.includes('@')) return `${digits}@c.us`
  return digits
}

function fill(template: string, order: Order, extra: Record<string, string> = {}) {
  const detalle = order.items.map((i) => `${i.qty}x ${i.name}`).join('\n')
  const tipoEntrega =
    order.type === 'delivery'
      ? '🛵 Delivery a tu dirección.'
      : order.type === 'llevar'
        ? '🏪 Pasa a recogerlo al local.'
        : `🍽️ Mesa ${order.tableNumber || ''}`

  const pago =
    (order as Order & { codPaymentMethod?: string }).paymentMethod === 'pendiente'
      ? 'Contra entrega'
      : order.paymentMethod

  const map: Record<string, string> = {
    nombre: order.customerName,
    numero: String(order.number),
    total: soles(order.total),
    detalle,
    tipo_entrega: tipoEntrega,
    direccion: order.address || 'N/A',
    telefono: order.customerPhone || '',
    tipo: order.type,
    pago: String(pago),
    direccion_line: order.address ? `📍 ${order.address}` : '',
    ...extra,
  }

  return Object.entries(map).reduce(
    (msg, [k, v]) => msg.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
    template,
  )
}

export async function sendWhatsAppText(
  phone: string,
  text: string,
  config: WspgoConfig = loadWspgoConfig(),
): Promise<{ ok: boolean; error?: string }> {
  if (!config.enabled) return { ok: false, error: 'WhatsApp deshabilitado' }
  if (!phone) return { ok: false, error: 'Sin teléfono' }

  const base = config.baseUrl.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apiKey,
      },
      body: JSON.stringify({
        session: config.session,
        chatId: toChatId(phone),
        text,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: body || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function getSessionStatus(config: WspgoConfig = loadWspgoConfig()) {
  const base = config.baseUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(config.session)}`, {
    headers: { 'X-Api-Key': config.apiKey },
  })
  if (!res.ok) throw new Error(`Sesión HTTP ${res.status}`)
  return res.json() as Promise<{ name: string; status: string }>
}

/** Avisos automáticos al crear pedido */
export async function notifyOrderCreated(order: Order) {
  const config = await fetchWspgoConfig()
  if (!config.enabled) return

  const tasks: Promise<unknown>[] = []

  if (config.autoNotifyLocal && config.notifyPhone) {
    tasks.push(sendWhatsAppText(config.notifyPhone, fill(config.templates.avisoLocal, order), config))
  }

  if (config.autoNotifyCustomer && order.customerPhone) {
    tasks.push(
      sendWhatsAppText(order.customerPhone, fill(config.templates.pedidoRecibido, order), config),
    )
  }

  await Promise.allSettled(tasks)
}

/** Avisos al cambiar estado */
export async function notifyOrderStatus(order: Order, status: Order['status']) {
  const config = await fetchWspgoConfig()
  if (!config.enabled || !config.autoNotifyCustomer || !order.customerPhone) return

  if (status === 'listo') {
    await sendWhatsAppText(order.customerPhone, fill(config.templates.pedidoListo, order), config)
  }
}
