const WSP_BASE = (process.env.WSPGO_BASE_URL || 'https://iwspgo.indevsoft.com').replace(/\/$/, '')
const WSP_KEY = process.env.WSPGO_API_KEY || '753ce43470bc2ad5b72bce84a7080d7ec92f77a6690bff51e5e03a5cd14eb6e0'
const WSP_SESSION = process.env.WSPGO_SESSION || 'PolleriaLopez'

/** El gateway a veces tarda 15–40 s en confirmar. No abortamos: el mensaje sigue en camino. */
const HARD_MS = 45_000
const QUICK_MS = 2_200
const SESSION_MS = 4_000
const SESSION_CACHE_MS = 15_000

let sessionCache: { at: number; up: boolean } | null = null

/** true solo si la sesión WAHA está WORKING. Si el gateway no responde, false. */
export async function isWhatsAppReady(): Promise<boolean> {
  if (sessionCache && Date.now() - sessionCache.at < SESSION_CACHE_MS) return sessionCache.up
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), SESSION_MS)
  let up = false
  try {
    const res = await fetch(`${WSP_BASE}/api/sessions/${encodeURIComponent(WSP_SESSION)}`, {
      headers: { Accept: 'application/json', 'X-Api-Key': WSP_KEY },
      signal: ctrl.signal,
    })
    if (res.ok) {
      const data = (await res.json()) as { status?: string }
      up = String(data.status || '').toUpperCase() === 'WORKING'
    }
  } catch (e) {
    console.warn('[whatsapp] sesión', (e as Error).message)
  } finally {
    clearTimeout(timer)
  }
  sessionCache = { at: Date.now(), up }
  return up
}

export function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 9 && digits.startsWith('9')) digits = `51${digits}`
  return digits
}

export function toChatId(phone: string) {
  const d = normalizePhone(phone)
  return d.includes('@') ? d : `${d}@c.us`
}

export async function sendWhatsAppText(phone: string, text: string): Promise<void> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), HARD_MS)
  try {
    const res = await fetch(`${WSP_BASE}/api/sendText`, {
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
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(body || `WhatsApp HTTP ${res.status}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Responde en ~2 s. Si el gateway sigue trabajando, el envío continúa en segundo plano. */
export async function sendWhatsAppSoon(
  phone: string,
  text: string,
  waitMs = QUICK_MS,
): Promise<{ ok: true; pending: boolean }> {
  const p = sendWhatsAppText(phone, text)
  const winner = await Promise.race([
    p.then(() => 'ok' as const),
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), waitMs)),
  ])
  if (winner === 'pending') {
    p.catch((e) => console.warn('[whatsapp] tardío', (e as Error).message))
    return { ok: true, pending: true }
  }
  return { ok: true, pending: false }
}
