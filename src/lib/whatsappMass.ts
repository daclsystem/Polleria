import * as XLSX from 'xlsx'
import { sendWhatsAppText, type WspgoConfig } from './whatsapp'

export type MassRow = { phone: string; name: string; message: string }

export type MassStatus = {
  running: boolean
  total: number
  sent: number
  failed: number
  current?: string
  lastError?: string
}

const listeners = new Set<(s: MassStatus) => void>()
let status: MassStatus = { running: false, total: 0, sent: 0, failed: 0 }
let queue: MassRow[] = []
let configRef: WspgoConfig | null = null

function emit() {
  const snap = { ...status }
  listeners.forEach((fn) => fn(snap))
}

export function subscribeMass(fn: (s: MassStatus) => void) {
  listeners.add(fn)
  fn({ ...status })
  return () => {
    listeners.delete(fn)
  }
}

export function downloadMassTemplate() {
  const wb = XLSX.utils.book_new()
  const data = [
    ['telefono', 'nombre', 'mensaje'],
    ['51999999999', 'Ana', 'Hola Ana, esta semana 2x1 en combos. Chifa-Pollería Lopez'],
    ['918888888', 'Luis', 'Hola Luis, te esperamos. Pedidos: chifapollerialopez.com'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Masivo')
  XLSX.writeFile(wb, 'formato-whatsapp-masivo.xlsx')
}

export function parseMassXlsx(buf: ArrayBuffer): MassRow[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const out: MassRow[] = []
  for (const r of rows) {
    const phone = String(r.telefono || r.Telefono || r.phone || r.celular || '').trim()
    const name = String(r.nombre || r.Nombre || r.name || '').trim()
    const message = String(r.mensaje || r.Mensaje || r.message || '').trim()
    if (!phone.replace(/\D/g, '') || !message) continue
    out.push({
      phone,
      name,
      message: message.replace(/\{nombre\}/g, name || 'cliente'),
    })
  }
  return out
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function pump() {
  if (status.running) return
  status.running = true
  emit()
  while (queue.length) {
    const row = queue.shift()!
    status.current = row.phone
    emit()
    const cfg = configRef
    if (!cfg) break
    const res = await sendWhatsAppText(row.phone, row.message, cfg)
    if (res.ok) status.sent += 1
    else {
      status.failed += 1
      status.lastError = res.error
    }
    emit()
    // Pausa anti-spam (4.5–7.5 s)
    if (queue.length) await delay(4500 + Math.floor(Math.random() * 3000))
  }
  status.running = false
  status.current = undefined
  emit()
}

export function enqueueMass(rows: MassRow[], config: WspgoConfig) {
  configRef = config
  queue.push(...rows)
  status.total += rows.length
  void pump()
}

export function resetMass() {
  if (status.running) return
  queue = []
  status = { running: false, total: 0, sent: 0, failed: 0 }
  emit()
}
