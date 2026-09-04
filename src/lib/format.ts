const pe = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

export function soles(n: number) {
  return pe.format(n)
}

/** Montos para ticket térmico: solo ASCII, sin el NBSP de Intl que sale como "?". */
export function solesPrint(n: number) {
  const v = round2(n)
  const sign = v < 0 ? '-' : ''
  const [int, dec] = Math.abs(v).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}S/ ${grouped}.${dec}`
}

export function padOrder(n: number) {
  return `#${String(n).padStart(4, '0')}`
}

const LIMA = 'America/Lima'

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: LIMA,
  })
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: LIMA,
  })
}

export function formatDateTime(iso: string) {
  return `${formatDate(iso)} ${formatTime(iso)}`
}

export function elapsedMinutes(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
}

export function limaYmd(isoOrDate: string | Date = new Date()) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  return new Intl.DateTimeFormat('en-CA', { timeZone: LIMA }).format(d)
}

export function isSameDay(iso: string, date = new Date()) {
  return limaYmd(iso) === limaYmd(date)
}

export function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`
}

export function totalsFromItems(items: { qty: number; price: number }[], discount = 0, igvRate = 0.18) {
  const gross = items.reduce((s, i) => s + i.qty * i.price, 0)
  const afterDiscount = Math.max(0, gross - discount)
  const subtotal = afterDiscount / (1 + igvRate)
  const igv = afterDiscount - subtotal
  return {
    subtotal: round2(subtotal),
    igv: round2(igv),
    total: round2(afterDiscount),
  }
}

export function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function qtyLabel(n: number) {
  const v = Math.round(Number(n || 0) * 1000) / 1000
  return Number.isInteger(v) ? String(v) : String(v)
}

export function copyText(text: string) {
  return navigator.clipboard.writeText(text)
}
