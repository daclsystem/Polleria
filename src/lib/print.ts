import { formatDate, formatDateTime, formatTime, padOrder, solesPrint } from './format'
import { getDeviceOS } from './platform'
import { printRawbt, sendToPrinter } from './printer-driver'
import { defaultPrinterSetup, loadPrinterSetup } from './printerStore'
import { prepareTicketShare, shareTicketPayload } from './share'
import { buildTicketDoc, renderEscPos, type TicketDoc, type TicketKind } from './ticket-doc'
import type { Order, PrinterConfig, Settings } from '../types'
import { DEFAULT_PRINTER, PAY_LABEL, TYPE_LABEL } from '../types'

export type { TicketKind }

// ─── HTML ticket (browser fallback) ─────────────────────────────────────────

function esc(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function standaloneBar() {
  return `
  <div class="noprint standalone-bar" id="standalone-bar">
    <p>Vista previa</p>
    <button type="button" class="print" onclick="window.print()">Imprimir</button>
    <button type="button" onclick="goBackToSystem()">Cerrar</button>
  </div>
  <script>
    // Dentro del overlay del sistema la barra de arriba ya tiene los botones.
    try { if (window.parent && window.parent !== window) { document.getElementById('standalone-bar').hidden = true; } } catch (e) {}
    function goBackToSystem() {
      try { if (window.parent && window.parent !== window && window.parent.closePrintPreview) { window.parent.closePrintPreview(); return; } } catch (e) {}
      try { window.close(); } catch (e) {}
      if (window.opener) { window.close(); return; }
      if (history.length > 1) { history.back(); return; }
    }
  </script>`
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
    .muted { color: #444; }
    .dash { border: 0; border-top: 1px dashed #111; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .item { margin: 4px 0; }
    .note { font-size: 11px; font-style: italic; }
    .big { font-size: 18px; font-weight: 800; }
    .cut { text-align: center; font-size: 10px; margin-top: 10px; }
    h1, h2, p { margin: 0 0 4px; }
    .standalone-bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      padding: 12px 14px; padding-top: max(12px, env(safe-area-inset-top));
      background: #0c0c0c; color: #fff; font-family: system-ui, sans-serif;
    }
    .standalone-bar[hidden] { display: none !important; }
    .standalone-bar p { margin: 0; flex: 1 1 120px; font-weight: 600; font-size: 14px; }
    .standalone-bar button {
      min-height: 44px; border: 0; border-radius: 12px; padding: 0 16px;
      font-weight: 700; font-size: 14px; background: #fff; color: #111; cursor: pointer;
    }
    .standalone-bar button.print { background: #1a3d1a; color: #fff; }
    @media print { .noprint { display: none !important; } }
  </style>
</head>
<body>
  ${standaloneBar()}
  <div class="sheet">${inner}</div>
</body>
</html>`
}

export function ticketHtml(order: Order, settings: Settings, kind: TicketKind) {
  const printedAt = new Date().toISOString()
  const heading =
    kind === 'cocina' ? 'COMANDA COCINA' : kind === 'cuenta' ? 'PRE-CUENTA' : 'TICKET DE VENTA'
  const items = order.items
    .map((i) => {
      const line =
        kind === 'cocina'
          ? `<div class="item"><strong>${i.qty}x</strong> ${esc(i.name)}${i.notes ? `<div class="note">** ${esc(i.notes)}</div>` : ''}</div>`
          : `<div class="item"><div class="row"><span>${i.qty}x ${esc(i.name)}</span><span>${esc(solesPrint(i.qty * i.price))}</span></div>${i.notes ? `<div class="note">${esc(i.notes)}</div>` : ''}</div>`
      return line
    })
    .join('')

  const money =
    kind === 'cocina'
      ? ''
      : `<hr class="dash" />
        <div class="row muted"><span>Subtotal</span><span>${esc(solesPrint(order.subtotal))}</span></div>
        ${order.discount ? `<div class="row muted"><span>Descuento</span><span>- ${esc(solesPrint(order.discount))}</span></div>` : ''}
        <div class="row muted"><span>IGV ${(settings.igvRate * 100).toFixed(0)}%</span><span>${esc(solesPrint(order.igv))}</span></div>
        <div class="row big"><span>TOTAL</span><span>${esc(solesPrint(order.total))}</span></div>
        <p class="center muted" style="margin-top:8px">${esc(PAY_LABEL[order.paymentMethod])} · ${order.paid ? 'PAGADO' : 'POR COBRAR'}</p>`

  const inner = `
    <div class="center">
      <p class="brand">${esc(settings.name)}</p>
      <p class="muted">${esc(settings.slogan)}</p>
      <p class="muted">${esc(settings.address)}</p>
      <p class="muted">RUC ${esc(settings.ruc)} · ${esc(settings.phone)}</p>
    </div>
    <hr class="dash" />
    <p class="center big">${heading}</p>
    <p class="center">${esc(padOrder(order.number))} · ${esc(formatDate(printedAt))}</p>
    <p class="center"><strong>Hora ${esc(formatTime(printedAt))}</strong></p>
    <p>${esc(TYPE_LABEL[order.type])}${order.tableNumber ? ` · Mesa ${order.tableNumber}` : ''}</p>
    <p><strong>Cliente: ${esc(order.customerName || '—')}</strong></p>
    ${order.customerPhone ? `<p>Cel: ${esc(order.customerPhone)}</p>` : ''}
    ${order.address ? `<p>${esc(order.address)}</p>` : ''}
    ${order.createdBy ? `<p>Mozo: ${esc(order.createdBy)}</p>` : ''}
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
  .standalone-bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    padding: 12px 14px; padding-top: max(12px, env(safe-area-inset-top));
    background: #0c0c0c; color: #fff;
  }
  .standalone-bar[hidden] { display: none !important; }
  .standalone-bar p { margin: 0; flex: 1 1 120px; font-weight: 600; font-size: 14px; }
  .standalone-bar button {
    min-height: 44px; border: 0; border-radius: 12px; padding: 0 16px;
    font-weight: 700; font-size: 14px; background: #fff; color: #111; cursor: pointer;
  }
  .standalone-bar button.print { background: #1a3d1a; color: #fff; }
  @media print { .noprint { display: none !important; } }
</style></head>
<body>
${standaloneBar()}
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
    <div class="polleria-print-bar">
      ${rawbtBtn}
      ${shareBtn}
      <button type="button" data-print>Imprimir</button>
      <button type="button" data-close>Cerrar</button>
    </div>
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

export async function printTicket(order: Order, settings: Settings, kind: TicketKind) {
  const config = getPrinterConfig(settings, kind)
  const ticket = buildTicketDoc(order, settings, kind, config?.cols ?? 48)
  const preview = (error?: string) =>
    printHtmlFallback(ticketHtml(order, settings, kind), { ticket, config: config ?? undefined, error })

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

// Re-export for backward compatibility
export { printHtmlFallback as printHtml }
