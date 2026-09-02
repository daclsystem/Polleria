import { formatDate, formatDateTime, formatTime, padOrder, solesPrint } from './format'
import { getDeviceOS } from './platform'
import { printRawbt, sendToPrinter } from './printer-driver'
import { defaultPrinterSetup, loadPrinterSetup } from './printerStore'
import { prepareTicketShare, shareTicketPayload } from './share'
import { buildTicketDoc, renderEscPos, type TicketDoc, type TicketKind } from './ticket-doc'
import type { Order, PrinterConfig, Settings, User } from '../types'
import { DEFAULT_PRINTER, PAY_LABEL, TYPE_LABEL } from '../types'
import { publicWebHost, withBase } from './paths'
import { ticketPublicPhone } from './webSite'
import { staffLabel } from './staffLabel'

export type { TicketKind }

// ─── HTML ticket (browser fallback) ─────────────────────────────────────────

function esc(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function ticketShell(title: string, inner: string, width = '80mm') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    @page { size: ${width} auto; margin: 4mm; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 12px; }
    .sheet { width: 72mm; margin: 0 auto; padding: 12px 0 24px; }
    .center { text-align: center; }
    .brand { font-size: 16px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .logo { display: block; width: 62mm; max-width: 100%; height: auto; margin: 0 auto 6px; background: #fff; }
    img.logo { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .muted { color: #444; }
    .dash { border: 0; border-top: 1px dashed #111; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .item { margin: 4px 0; }
    .note { font-size: 11px; font-style: italic; }
    .big { font-size: 18px; font-weight: 800; }
    .mesa { font-size: 22px; font-weight: 900; letter-spacing: 0.04em; }
    .cut { text-align: center; font-size: 10px; margin-top: 10px; }
    h1, h2, p { margin: 0 0 4px; }
    @media print { .noprint { display: none !important; } }
  </style>
</head>
<body>
  <div class="sheet">${inner}</div>
</body>
</html>`
}

function ticketLogoSrc() {
  if (typeof window === 'undefined') return withBase('logo-lopez.png')
  return new URL(withBase('logo-lopez.png'), window.location.origin).href
}

function sloganOk(s?: string) {
  const t = (s || '').trim()
  if (t.length < 4) return false
  if (/^api\s*ok$/i.test(t)) return false
  return true
}

function headerContactHtml(settings: Settings) {
  const rucDigits = (settings.ruc || '').replace(/\D/g, '')
  const phone = ticketPublicPhone()
  const bits: string[] = []
  if (rucDigits.length >= 8) bits.push(`<p class="muted">RUC ${esc(settings.ruc)}</p>`)
  if (phone) bits.push(`<p class="muted">Tel. ${esc(phone)}</p>`)
  bits.push(`<p class="muted">${esc(publicWebHost())}</p>`)
  return bits.join('')
}

export function ticketHtml(order: Order, settings: Settings, kind: TicketKind) {
  const printedAt = new Date().toISOString()
  const heading =
    kind === 'cocina'
      ? 'COMANDA COCINA'
      : kind === 'cuenta'
        ? 'PRE-CUENTA'
        : order.docTipo === 'factura'
          ? 'FACTURA'
          : order.docTipo && order.docTipo !== 'ninguno'
            ? 'BOLETA'
            : 'TICKET DE VENTA'
  const items = order.items
    .map((i) => {
      const line =
        kind === 'cocina'
          ? `<div class="item"><strong>${i.qty}x</strong> ${esc(i.name)}${i.notes ? `<div class="note">** ${esc(i.notes)}</div>` : ''}</div>`
          : `<div class="item"><div class="row"><span>${i.qty}x ${esc(i.name)}</span><span>${esc(solesPrint(i.qty * i.price))}</span></div>${i.notes ? `<div class="note">${esc(i.notes)}</div>` : ''}</div>`
      return line
    })
    .join('')

  const factura = order.docTipo === 'factura'
  const money =
    kind === 'cocina'
      ? ''
      : `<hr class="dash" />
        ${factura ? `<div class="row muted"><span>Op. gravadas</span><span>${esc(solesPrint(order.subtotal))}</span></div>` : ''}
        ${order.discount ? `<div class="row muted"><span>Descuento</span><span>- ${esc(solesPrint(order.discount))}</span></div>` : ''}
        ${factura ? `<div class="row muted"><span>IGV ${(settings.igvRate * 100).toFixed(0)}% (incluido)</span><span>${esc(solesPrint(order.igv))}</span></div>` : ''}
        <div class="row big"><span>TOTAL</span><span>${esc(solesPrint(order.total))}</span></div>
        <p class="center muted" style="margin-top:8px">${esc(PAY_LABEL[order.paymentMethod])} · ${order.paid ? 'PAGADO' : 'POR COBRAR'}</p>`

  const billing =
    kind !== 'cocina' && (order.docTipo === 'factura' || order.docTipo === 'boleta_dni' || order.docTipo === 'boleta_simple')
      ? `<p>${order.docTipo === 'factura' && order.docNumero ? `RUC ${esc(order.docNumero)}` : order.docTipo === 'boleta_dni' && order.docNumero ? `DNI ${esc(order.docNumero)}` : ''}</p>
        ${order.docNombre ? `<p><strong>${esc(order.docNombre)}</strong></p>` : ''}
        ${order.docAddress ? `<p>${esc(order.docAddress)}</p>` : ''}`
      : ''

  const mesa = order.tableNumber
    ? `<p class="center mesa">MESA ${esc(String(order.tableNumber))}</p>`
    : ''

  const inner = `
    <div class="center">
      <img class="logo" src="${esc(ticketLogoSrc())}" alt="${esc(settings.name)}" />
      ${sloganOk(settings.slogan) ? `<p class="muted">${esc(settings.slogan)}</p>` : ''}
      <p class="muted">${esc(settings.address)}</p>
      ${headerContactHtml(settings)}
    </div>
    <hr class="dash" />
    <p class="center big">${heading}</p>
    <p class="center">${esc(padOrder(order.number))} · ${esc(formatDate(printedAt))}</p>
    <p class="center"><strong>Hora ${esc(formatTime(printedAt))}</strong></p>
    ${mesa}
    <p class="center"><strong>${esc(TYPE_LABEL[order.type])}</strong></p>
    <p><strong>Cliente: ${esc(order.customerName || '—')}</strong></p>
    ${order.customerPhone ? `<p>Cel: ${esc(order.customerPhone)}</p>` : ''}
    ${order.address ? `<p>${esc(order.address)}</p>` : ''}
    <p><strong>Mozo: ${esc(order.createdBy || '—')}</strong></p>
    ${billing}
    <hr class="dash" />
    ${items}
    ${order.notes ? `<p class="note">Nota: ${esc(order.notes)}</p>` : ''}
    ${money}
    <hr class="dash" />
    <p class="center muted">${kind === 'cocina' ? 'Preparar con receta de la casa' : 'Gracias por su visita'}</p>
    <p class="cut">- - - corte aquí - - -</p>
  `
  return ticketShell(`${heading} ${padOrder(order.number)}`, inner)
}

export function reportHtml(opts: {
  settings: Settings
  title: string
  period: string
  sales: string
  tickets: string
  igv: string
  rows: string[][]
}) {
  const table = opts.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  const inner = `
    <h1 style="font-family:Georgia,serif;font-size:22px;margin:0">${esc(opts.settings.name)}</h1>
    <p>${esc(opts.settings.address)} · RUC ${esc(opts.settings.ruc)}</p>
    <h2 style="margin:16px 0 8px">${esc(opts.title)}</h2>
    <p>Periodo: ${esc(opts.period)}</p>
    <p><strong>Ventas:</strong> ${esc(opts.sales)} · <strong>Tickets:</strong> ${esc(opts.tickets)} · <strong>IGV:</strong> ${esc(opts.igv)}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:12px">
      <thead>
        <tr>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Nº</th>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Fecha</th>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Cliente</th>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Canal</th>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Pago</th>
          <th style="text-align:right;border-bottom:1px solid #111;padding:6px">Total</th>
        </tr>
      </thead>
      <tbody>${table}</tbody>
    </table>
    <p style="margin-top:24px;font-size:11px;color:#555">Impreso ${esc(formatDateTime(new Date().toISOString()))}</p>
  `
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(opts.title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: system-ui, sans-serif; color: #111; margin: 0; }
  .report { padding: 16px; }
  td { padding: 6px; border-bottom: 1px solid #ddd; }
  @media print { .noprint { display: none !important; } }
</style></head>
<body>
<div class="report">${inner}</div>
</body></html>`
}

// ─── Print dispatchers ──────────────────────────────────────────────────────

const OVERLAY_ID = 'polleria-print-overlay'
const TOAST_ID = 'polleria-print-toast'

let printKeyHandler: ((e: KeyboardEvent) => void) | null = null

function closePrintPreview() {
  if (printKeyHandler) {
    document.removeEventListener('keydown', printKeyHandler)
    printKeyHandler = null
  }
  document.getElementById(OVERLAY_ID)?.remove()
  document.documentElement.style.removeProperty('overflow')
  document.body.style.removeProperty('overflow')
}

if (typeof window !== 'undefined') {
  ;(window as Window & { closePrintPreview?: () => void }).closePrintPreview = closePrintPreview
}

interface PreviewOptions {
  /** Habilita los botones "Enviar a RawBT" y "Compartir". */
  ticket?: TicketDoc
  /** Impresora con la que se generan los bytes ESC/POS del botón RawBT. */
  config?: PrinterConfig
  /** Motivo por el que no se pudo imprimir directo. */
  error?: string
}

function printHtmlFallback(html: string, opts: PreviewOptions = {}) {
  closePrintPreview()
  document.getElementById(TOAST_ID)?.remove()

  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Vista previa de impresión')
  const shareBtn = opts.ticket ? '<button type="button" data-share>Compartir</button>' : ''
  const rawbtBtn =
    opts.ticket && getDeviceOS() === 'android'
      ? '<button type="button" data-rawbt>Enviar a RawBT</button>'
      : ''
  overlay.innerHTML = `
    <style>
      #${OVERLAY_ID} {
        position: fixed; inset: 0; z-index: 2147483000;
        display: flex; flex-direction: column;
        background: #111; color: #fff;
      }
      #${OVERLAY_ID} .polleria-print-bar {
        flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
        padding: 12px 14px; padding-top: max(12px, env(safe-area-inset-top));
        background: #0c0c0c; border-bottom: 1px solid rgba(255,255,255,0.12);
      }
      #${OVERLAY_ID} .polleria-print-bar p {
        margin: 0; flex: 1 1 140px; font: 600 14px/1.3 system-ui, sans-serif;
      }
      #${OVERLAY_ID} .polleria-print-bar button {
        min-height: 44px; border: 0; border-radius: 12px; padding: 0 16px;
        font: 700 14px system-ui, sans-serif; cursor: pointer;
      }
      #${OVERLAY_ID} .polleria-print-error {
        flex: 0 0 auto; margin: 0; padding: 10px 14px;
        background: #7a2214; color: #fff; font: 600 13px/1.4 system-ui, sans-serif;
      }
      #${OVERLAY_ID} [data-close] { background: #fff; color: #111; }
      #${OVERLAY_ID} [data-print] { background: #1a3d1a; color: #fff; }
      #${OVERLAY_ID} [data-rawbt] { background: #d1541f; color: #fff; }
      #${OVERLAY_ID} [data-share] { background: #2f3d55; color: #fff; }
      #${OVERLAY_ID} iframe { flex: 1 1 auto; width: 100%; border: 0; background: #fff; }
      @media print { #${OVERLAY_ID} { display: none !important; } }
    </style>
    <div class="polleria-print-bar">
      <p data-status>Vista previa</p>
      ${rawbtBtn}
      ${shareBtn}
      <button type="button" data-print>Imprimir</button>
      <button type="button" data-close>Cerrar</button>
    </div>
    ${opts.error ? `<p class="polleria-print-error">No se pudo imprimir: ${esc(opts.error)}</p>` : ''}
    <iframe title="Documento a imprimir"></iframe>
  `

  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  document.body.appendChild(overlay)

  printKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closePrintPreview()
    }
  }
  document.addEventListener('keydown', printKeyHandler)

  const iframe = overlay.querySelector('iframe')
  overlay.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closePrintPreview())
  })
  overlay.querySelectorAll('[data-print]').forEach((el) => {
    el.addEventListener('click', () => iframe?.contentWindow?.print())
  })

  if (opts.ticket) {
    const ticket = opts.ticket
    const status = overlay.querySelector('[data-status]')
    // El PNG se genera ya: navigator.share exige gesto del usuario y hacerlo
    // dentro del click lo invalidaría en iOS.
    const payload = prepareTicketShare(ticket)
    overlay.querySelectorAll('[data-share]').forEach((el) => {
      el.addEventListener('click', async () => {
        const outcome = await shareTicketPayload(await payload)
        if (status && outcome === 'downloaded') status.textContent = 'Ticket descargado'
      })
    })
    overlay.querySelectorAll('[data-rawbt]').forEach((el) => {
      el.addEventListener('click', async () => {
        if (status) status.textContent = 'Enviando a RawBT…'
        await printRawbt(renderEscPos(ticket, opts.config ?? DEFAULT_PRINTER))
        if (status) status.textContent = 'Enviado a RawBT'
      })
    })
  }

  const doc = iframe?.contentDocument
  if (!iframe || !doc) {
    closePrintPreview()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
}

/**
 * RawBT no devuelve confirmación, así que se avisa en pantalla y se deja a mano
 * la vista previa por si la app no llegó a imprimir.
 */
function showRawbtToast(onFallback: () => void) {
  document.getElementById(TOAST_ID)?.remove()

  const toast = document.createElement('div')
  toast.id = TOAST_ID
  toast.innerHTML = `
    <style>
      #${TOAST_ID} {
        position: fixed; z-index: 2147482000;
        left: 50%; transform: translateX(-50%);
        bottom: max(16px, env(safe-area-inset-bottom));
        display: flex; align-items: center; gap: 12px;
        max-width: calc(100vw - 24px);
        padding: 10px 12px 10px 16px; border-radius: 14px;
        background: #0c0c0c; color: #fff;
        font: 600 13px/1.3 system-ui, sans-serif;
        box-shadow: 0 12px 32px rgba(0,0,0,0.35);
      }
      #${TOAST_ID} button {
        min-height: 36px; border: 0; border-radius: 10px; padding: 0 12px;
        font: 700 13px system-ui, sans-serif; cursor: pointer;
        background: #fff; color: #111;
      }
      @media print { #${TOAST_ID} { display: none !important; } }
    </style>
    <span>Ticket enviado a RawBT</span>
    <button type="button">Ver ticket</button>
  `
  document.body.appendChild(toast)

  const timer = setTimeout(() => toast.remove(), 6000)
  toast.querySelector('button')?.addEventListener('click', () => {
    clearTimeout(timer)
    toast.remove()
    onFallback()
  })
}

function getPrinterConfig(settings: Settings, kind: TicketKind): PrinterConfig | null {
  const printers = loadPrinterSetup() ?? settings.printers ?? defaultPrinterSetup()
  if (kind === 'cocina') return printers.cocina?.enabled ? printers.cocina : null
  return printers.caja?.enabled ? printers.caja : null
}

export async function printTicket(order: Order, settings: Settings, kind: TicketKind, users: User[] = []) {
  const labeled = { ...order, createdBy: staffLabel(order, users) }
  const config = getPrinterConfig(settings, kind)
  const ticket = buildTicketDoc(labeled, settings, kind, config?.cols ?? 48)
  const preview = (error?: string) =>
    printHtmlFallback(ticketHtml(labeled, settings, kind), { ticket, config: config ?? undefined, error })

  if (config && config.driver !== 'browser') {
    const result = await sendToPrinter(renderEscPos(ticket, config), config)
    if (result.ok) {
      if (config.driver === 'rawbt') showRawbtToast(() => preview())
      return
    }

    preview(result.error)
    return
  }

  preview()
}

export function printReport(html: string) {
  printHtmlFallback(html)
}

export function cashCloseHtml(opts: {
  settings: Settings
  fromAt: string
  closedAt: string
  ordersCount: number
  sales: number
  efectivo: number
  yape: number
  tarjeta: number
  counted: number
  difference: number
  notes?: string
  signature?: string
}) {
  const diffTxt =
    Math.abs(opts.difference) < 0.01
      ? 'Cuadra'
      : opts.difference > 0
        ? `Sobrante ${solesPrint(opts.difference)}`
        : `Faltante ${solesPrint(Math.abs(opts.difference))}`
  const sig = opts.signature
    ? `<img alt="Firma" src="${opts.signature}" style="display:block;width:100%;max-height:90px;object-fit:contain;background:#fff" />`
    : `<div style="height:72px"></div>`
  const inner = `
    <p class="center brand">${esc(opts.settings.name)}</p>
    <p class="center muted">CIERRE DE CAJA / LIQUIDACIÓN</p>
    <hr class="dash" />
    <p>Turno: ${esc(formatDateTime(opts.fromAt))}</p>
    <p>Cierre: ${esc(formatDateTime(opts.closedAt))}</p>
    <hr class="dash" />
    <div class="row"><span>Pedidos cobrados</span><span>${opts.ordersCount}</span></div>
    <div class="row"><span>Ventas</span><span>${solesPrint(opts.sales)}</span></div>
    <div class="row"><span>Efectivo esperado</span><span>${solesPrint(opts.efectivo)}</span></div>
    <div class="row"><span>Yape</span><span>${solesPrint(opts.yape)}</span></div>
    <div class="row"><span>Tarjeta</span><span>${solesPrint(opts.tarjeta)}</span></div>
    <div class="row"><span>Efectivo contado</span><span>${solesPrint(opts.counted)}</span></div>
    <p class="big center" style="margin-top:8px">${esc(diffTxt)}</p>
    ${opts.notes ? `<p class="note">Nota: ${esc(opts.notes)}</p>` : ''}
    <hr class="dash" />
    <p class="muted">Entrega de efectivo y liquidación</p>
    ${sig}
    <p class="center muted" style="margin-top:4px">Firma de quien entrega / recibe</p>
    <p class="cut">- - - corte aquí - - -</p>
  `
  return ticketShell(`Cierre de caja ${formatDateTime(opts.closedAt)}`, inner)
}

// Re-export for backward compatibility
export { printHtmlFallback as printHtml }
