/**
 * Representación intermedia de un ticket: una lista de líneas con estilo.
 *
 * Desde este modelo se generan las tres salidas que necesita el POS:
 *   - bytes ESC/POS (USB, red, RawBT)
 *   - texto plano (compartir a apps de impresión)
 *   - imagen PNG (compartir por WhatsApp o a apps que imprimen imágenes)
 */

import { EscPosBuilder, rowText } from './escpos'
import { formatDate, formatTime, padOrder, solesPrint } from './format'
import { publicWebHost } from './paths'
import { ticketPublicPhone } from './webSite'
import type { Order, PrinterConfig, Settings } from '../types'
import { PAY_LABEL, TYPE_LABEL } from '../types'

export type TicketKind = 'caja' | 'cocina' | 'cuenta'

type Align = 'left' | 'center' | 'right'
type Size = 'normal' | 'wide' | 'double'

type Style = { align: Align; bold: boolean; size: Size }

export type TicketLine =
  | ({ t: 'text'; text: string } & Partial<Style>)
  | ({ t: 'row'; left: string; right: string } & Partial<Style>)
  | { t: 'sep'; char?: string }
  | { t: 'feed'; n?: number }

export interface TicketDoc {
  title: string
  kind: TicketKind
  cols: number
  beep: boolean
  openDrawer: boolean
  lines: TicketLine[]
}

// ─── Construcción ───────────────────────────────────────────────────────────

function header(settings: Settings, full: boolean): TicketLine[] {
  const lines: TicketLine[] = [
    { t: 'text', text: settings.name, align: 'center', bold: true, size: 'double' },
  ]
  const slogan = (settings.slogan || '').trim()
  if (full && slogan.length >= 4 && !/^api\s*ok$/i.test(slogan)) {
    lines.push({ t: 'text', text: slogan, align: 'center' })
  }
  lines.push({ t: 'text', text: settings.address, align: 'center' })
  if (full) {
    const rucDigits = (settings.ruc || '').replace(/\D/g, '')
    if (rucDigits.length >= 8) {
      lines.push({ t: 'text', text: `RUC ${settings.ruc}`, align: 'center' })
    }
  }
  const phone = ticketPublicPhone()
  if (phone) lines.push({ t: 'text', text: `Tel. ${phone}`, align: 'center' })
  lines.push({ t: 'text', text: publicWebHost(), align: 'center' })
  lines.push({ t: 'sep', char: '=' })
  return lines
}

function orderMeta(
  order: Order,
  opts: { phone?: boolean; address?: boolean; boldNumber?: boolean } = {},
): TicketLine[] {
  const printedAt = new Date().toISOString()
  const lines: TicketLine[] = [
    {
      t: 'text',
      text: `${padOrder(order.number)} · ${formatDate(printedAt)}`,
      align: 'center',
      bold: opts.boldNumber,
    },
    {
      t: 'text',
      text: `Hora ${formatTime(printedAt)}`,
      align: 'center',
      bold: true,
    },
  ]
  if (order.tableNumber) {
    lines.push({
      t: 'text',
      text: `MESA ${order.tableNumber}`,
      align: 'center',
      bold: true,
      size: 'double',
    })
  }
  lines.push({
    t: 'text',
    text: TYPE_LABEL[order.type],
    align: 'center',
    bold: !order.tableNumber,
  })
  lines.push({ t: 'text', text: `Cliente: ${order.customerName || '—'}`, bold: true })
  if (opts.phone && order.customerPhone) {
    lines.push({ t: 'text', text: `Cel: ${order.customerPhone}` })
  }
  if (opts.address && order.address) {
    lines.push({ t: 'text', text: order.address })
  }
  lines.push({ t: 'text', text: `Mozo: ${order.createdBy || '—'}`, bold: true })
  return lines
}

function totals(order: Order, settings: Settings): TicketLine[] {
  const factura = order.docTipo === 'factura'
  const lines: TicketLine[] = [{ t: 'sep' }]
  if (factura) {
    lines.push({ t: 'row', left: 'Op. gravadas', right: solesPrint(order.subtotal) })
    if (order.discount) {
      lines.push({ t: 'row', left: 'Descuento', right: `- ${solesPrint(order.discount)}` })
    }
    lines.push({
      t: 'row',
      left: `IGV ${(settings.igvRate * 100).toFixed(0)}% (incluido)`,
      right: solesPrint(order.igv),
    })
  } else if (order.discount) {
    lines.push({ t: 'row', left: 'Descuento', right: `- ${solesPrint(order.discount)}` })
  }
  lines.push({ t: 'row', left: 'TOTAL', right: solesPrint(order.total), bold: true, size: 'double' })
  return lines
}

function billingBlock(order: Order): TicketLine[] {
  if (order.docTipo !== 'factura' && order.docTipo !== 'boleta_dni' && order.docTipo !== 'boleta_simple') {
    return []
  }
  const lines: TicketLine[] = [{ t: 'sep' }]
  if (order.docTipo === 'factura') {
    lines.push({ t: 'text', text: 'FACTURA', align: 'center', bold: true })
    if (order.docNumero) lines.push({ t: 'text', text: `RUC ${order.docNumero}` })
    if (order.docNombre) lines.push({ t: 'text', text: order.docNombre, bold: true })
  } else if (order.docTipo === 'boleta_dni') {
    lines.push({ t: 'text', text: 'BOLETA', align: 'center', bold: true })
    if (order.docNumero) lines.push({ t: 'text', text: `DNI ${order.docNumero}` })
    if (order.docNombre) lines.push({ t: 'text', text: order.docNombre })
  } else {
    lines.push({ t: 'text', text: 'BOLETA', align: 'center', bold: true })
    if (order.docNombre) lines.push({ t: 'text', text: order.docNombre })
  }
  if (order.docAddress) lines.push({ t: 'text', text: order.docAddress })
  return lines
}

function buildCaja(order: Order, settings: Settings, cols: number): TicketDoc {
  const heading =
    order.docTipo === 'factura' ? 'FACTURA' : order.docTipo === 'ninguno' || !order.docTipo ? 'TICKET DE VENTA' : 'BOLETA'
  const lines: TicketLine[] = [
    ...header(settings, true),
    { t: 'text', text: heading, align: 'center', bold: true },
    ...orderMeta(order, { phone: true, address: true }),
    ...billingBlock(order),
    { t: 'sep' },
  ]

  for (const item of order.items) {
    lines.push({ t: 'row', left: `${item.qty}x ${item.name}`, right: solesPrint(item.qty * item.price) })
    if (item.notes) lines.push({ t: 'text', text: `   ** ${item.notes}` })
  }
  if (order.notes) lines.push({ t: 'text', text: `Nota: ${order.notes}` })

  lines.push(...totals(order, settings))
  lines.push({ t: 'feed', n: 1 })
  lines.push({
    t: 'text',
    text: `${PAY_LABEL[order.paymentMethod]} · ${order.paid ? 'PAGADO' : 'POR COBRAR'}`,
    align: 'center',
  })
  lines.push({ t: 'feed', n: 1 })
  lines.push({ t: 'text', text: 'Gracias por su visita', align: 'center' })
  lines.push({ t: 'text', text: '- - - - -', align: 'center' })
  lines.push({ t: 'feed', n: 1 })

  return {
    title: `Ticket ${padOrder(order.number)}`,
    kind: 'caja',
    cols,
    beep: false,
    openDrawer: true,
    lines,
  }
}

function buildCocina(order: Order, settings: Settings, cols: number): TicketDoc {
  const heading = order.notes?.includes('ADICIONAL') ? 'COMANDA ADICIONAL' : 'COMANDA COCINA'
  const lines: TicketLine[] = [
    { t: 'text', text: heading, align: 'center', bold: true, size: 'double' },
    { t: 'text', text: settings.name, align: 'center', bold: true },
    { t: 'text', text: `Tel. ${ticketPublicPhone()}`, align: 'center' },
    { t: 'text', text: publicWebHost(), align: 'center' },
    { t: 'sep', char: '=' },
    ...orderMeta(order, { boldNumber: true }),
    { t: 'sep' },
  ]

  for (const item of order.items) {
    lines.push({ t: 'text', text: `${item.qty}x ${item.name}`, bold: true, size: 'wide' })
    if (item.notes) lines.push({ t: 'text', text: `   >> ${item.notes}` })
  }

  if (order.notes) {
    lines.push({ t: 'sep' })
    lines.push({ t: 'text', text: `NOTA: ${order.notes}`, bold: true })
  }

  lines.push({ t: 'sep' })
  lines.push({ t: 'text', text: 'Preparar con receta de la casa', align: 'center' })
  lines.push({ t: 'feed', n: 2 })

  return {
    title: `${heading} ${padOrder(order.number)}`,
    kind: 'cocina',
    cols,
    beep: true,
    openDrawer: false,
    lines,
  }
}

function buildCuenta(order: Order, settings: Settings, cols: number): TicketDoc {
  const lines: TicketLine[] = [
    ...header(settings, false),
    { t: 'text', text: 'PRE-CUENTA', align: 'center', bold: true },
    ...orderMeta(order),
    { t: 'sep' },
  ]

  for (const item of order.items) {
    lines.push({ t: 'row', left: `${item.qty}x ${item.name}`, right: solesPrint(item.qty * item.price) })
  }

  lines.push(...totals(order, settings))
  lines.push({ t: 'feed', n: 1 })
  lines.push({ t: 'text', text: 'Acérquese a caja para pagar', align: 'center' })
  lines.push({ t: 'text', text: 'Gracias por su preferencia', align: 'center' })
  lines.push({ t: 'feed', n: 2 })

  return {
    title: `Pre-cuenta ${padOrder(order.number)}`,
    kind: 'cuenta',
    cols,
    beep: false,
    openDrawer: false,
    lines,
  }
}

export function buildTicketDoc(
  order: Order,
  settings: Settings,
  kind: TicketKind,
  cols = 48,
): TicketDoc {
  if (kind === 'cocina') return buildCocina(order, settings, cols)
  if (kind === 'cuenta') return buildCuenta(order, settings, cols)
  return buildCaja(order, settings, cols)
}

export function testTicketDoc(label: string, cols: number): TicketDoc {
  return {
    title: 'Test de impresión',
    kind: 'caja',
    cols,
    beep: true,
    openDrawer: true,
    lines: [
      { t: 'text', text: 'TEST DE IMPRESION', align: 'center', bold: true, size: 'double' },
      { t: 'text', text: label, align: 'center' },
      { t: 'sep' },
      { t: 'text', text: 'Si ves este ticket, la' },
      { t: 'text', text: 'impresora está configurada' },
      { t: 'text', text: 'correctamente.' },
      { t: 'feed', n: 1 },
      { t: 'text', text: 'Chifa-Pollería Lopez', align: 'center' },
      { t: 'feed', n: 2 },
    ],
  }
}

// ─── Salida: ESC/POS ────────────────────────────────────────────────────────

/** Un carácter de doble ancho ocupa dos columnas, así que el ancho útil se parte. */
function widthFor(cols: number, size: Size) {
  return size === 'normal' ? cols : Math.floor(cols / 2)
}

export function renderEscPos(doc: TicketDoc, config: PrinterConfig): Uint8Array {
  const p = new EscPosBuilder(doc.cols)
  if (doc.beep && config.beepOnPrint) p.beep()

  const cur: Style = { align: 'left', bold: false, size: 'normal' }
  const apply = (want: Partial<Style>) => {
    const align = want.align ?? 'left'
    const bold = want.bold ?? false
    const size = want.size ?? 'normal'
    if (align !== cur.align) {
      if (align === 'center') p.center()
      else if (align === 'right') p.right()
      else p.left()
      cur.align = align
    }
    if (bold !== cur.bold) {
      p.bold(bold)
      cur.bold = bold
    }
    if (size !== cur.size) {
      if (size === 'double') p.double(true)
      else if (size === 'wide') p.wide(true)
      else p.double(false)
      cur.size = size
    }
    return size
  }

  for (const l of doc.lines) {
    if (l.t === 'sep') {
      apply({})
      p.separator(l.char ?? '-')
    } else if (l.t === 'feed') {
      p.feed(l.n ?? 1)
    } else if (l.t === 'text') {
      apply(l)
      p.line(l.text)
    } else {
      const size = apply(l)
      p.row(l.left, l.right, widthFor(doc.cols, size))
    }
  }

  apply({})
  if (doc.openDrawer && config.openDrawer) p.openDrawer()
  if (config.autoCut) p.cut()
  return p.build()
}

// ─── Salida: texto plano ────────────────────────────────────────────────────

function padLine(text: string, align: Align, width: number) {
  const t = text.length > width ? text.slice(0, width) : text
  if (align === 'center') return ' '.repeat(Math.floor((width - t.length) / 2)) + t
  if (align === 'right') return ' '.repeat(width - t.length) + t
  return t
}

export function renderText(doc: TicketDoc): string {
  const out: string[] = []
  for (const l of doc.lines) {
    if (l.t === 'sep') out.push((l.char ?? '-').repeat(doc.cols))
    else if (l.t === 'feed') for (let i = 0; i < (l.n ?? 1); i++) out.push('')
    else if (l.t === 'text') {
      out.push(padLine(l.text, l.align ?? 'left', widthFor(doc.cols, l.size ?? 'normal')))
    } else {
      out.push(rowText(l.left, l.right, widthFor(doc.cols, l.size ?? 'normal')))
    }
  }
  return out.join('\n')
}

// ─── Salida: imagen PNG ─────────────────────────────────────────────────────

const BASE_FONT = 24
const FONT_FAMILY = '"Courier New", ui-monospace, monospace'
const LINE_GAP = 1.35
const PADDING = 24

/** `wide` es doble ancho con altura normal; `double` es doble en ambos ejes. */
function metricsFor(size: Size) {
  if (size === 'double') return { px: BASE_FONT * 2, scaleX: 1, cw: 2 }
  if (size === 'wide') return { px: BASE_FONT, scaleX: 2, cw: 2 }
  return { px: BASE_FONT, scaleX: 1, cw: 1 }
}

export function renderCanvas(doc: TicketDoc): HTMLCanvasElement {
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = `${BASE_FONT}px ${FONT_FAMILY}`
  const charW = measure.measureText('0').width
  const sheet = doc.cols * charW
  const width = Math.ceil(sheet) + PADDING * 2

  type Drawn = { text: string; x: number; px: number; bold: boolean; scaleX: number; h: number }
  const drawn: Drawn[] = []

  for (const l of doc.lines) {
    if (l.t === 'feed') {
      for (let i = 0; i < (l.n ?? 1); i++) {
        drawn.push({ text: '', x: 0, px: BASE_FONT, bold: false, scaleX: 1, h: BASE_FONT * LINE_GAP })
      }
      continue
    }

    const size: Size = l.t === 'sep' ? 'normal' : (l.size ?? 'normal')
    const bold = l.t === 'sep' ? false : (l.bold ?? false)
    const { px, scaleX, cw } = metricsFor(size)
    const usable = widthFor(doc.cols, size)

    let text: string
    let align: Align = 'left'
    if (l.t === 'sep') {
      text = (l.char ?? '-').repeat(doc.cols)
    } else if (l.t === 'text') {
      text = l.text.length > usable ? l.text.slice(0, usable) : l.text
      align = l.align ?? 'left'
    } else {
      text = rowText(l.left, l.right, usable)
    }

    const w = text.length * cw * charW
    const x =
      align === 'center' ? PADDING + (sheet - w) / 2 : align === 'right' ? PADDING + sheet - w : PADDING
    drawn.push({ text, x, px, bold, scaleX, h: px * LINE_GAP })
  }

  const height = Math.ceil(drawn.reduce((acc, d) => acc + d.h, 0)) + PADDING * 2

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  let y = PADDING
  for (const d of drawn) {
    if (d.text) {
      ctx.save()
      ctx.translate(d.x, y + (d.h - d.px) / 2)
      ctx.scale(d.scaleX, 1)
      ctx.font = `${d.bold ? '700 ' : ''}${d.px}px ${FONT_FAMILY}`
      ctx.fillText(d.text, 0, 0)
      ctx.restore()
    }
    y += d.h
  }
  return canvas
}

export function renderPng(doc: TicketDoc): Promise<Blob> {
  return new Promise((resolve, reject) => {
    renderCanvas(doc).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))),
      'image/png',
    )
  })
}
