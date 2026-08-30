import { formatDateTime, padOrder, soles } from './format'
import { EscPosBuilder } from './escpos'
import { sendToPrinter } from './printer-driver'
import type { Order, PrinterConfig, Settings } from '../types'
import { PAY_LABEL, TYPE_LABEL } from '../types'

// ─── ESC/POS ticket builders ────────────────────────────────────────────────

function buildCajaTicket(order: Order, settings: Settings, config: PrinterConfig): Uint8Array {
  const p = new EscPosBuilder(config.cols)

  p.center().bold().double()
  p.line(settings.name)
  p.double(false).bold(false)
  p.line(settings.slogan)
  p.line(settings.address)
  p.line(`RUC ${settings.ruc} · ${settings.phone}`)
  p.separator('=')

  p.bold().line('TICKET DE VENTA').bold(false)
  p.line(`${padOrder(order.number)} · ${formatDateTime(order.createdAt)}`)
  p.left()
  p.line(`${TYPE_LABEL[order.type]}${order.tableNumber ? ` · Mesa ${order.tableNumber}` : ''}`)
  p.line(`Cliente: ${order.customerName}`)
  if (order.customerPhone) p.line(`Cel: ${order.customerPhone}`)
  if (order.address) p.line(order.address)
  p.line(`Atendió: ${order.createdBy}`)
  p.separator()

  for (const item of order.items) {
    p.row(`${item.qty}x ${item.name}`, soles(item.qty * item.price))
    if (item.notes) p.line(`   ** ${item.notes}`)
  }
  if (order.notes) p.line(`Nota: ${order.notes}`)

  p.separator()
  p.row('Subtotal', soles(order.subtotal))
  if (order.discount) p.row('Descuento', `- ${soles(order.discount)}`)
  p.row(`IGV ${(settings.igvRate * 100).toFixed(0)}%`, soles(order.igv))
  p.bold().double()
  p.row('TOTAL', soles(order.total))
  p.double(false).bold(false)

  p.feed(1).center()
  p.line(`${PAY_LABEL[order.paymentMethod]} · ${order.paid ? 'PAGADO' : 'POR COBRAR'}`)
  p.feed(1)
  p.line('Gracias por su visita')
  p.line('- - - - -')
  p.feed(1)

  if (config.openDrawer) p.openDrawer()
  if (config.autoCut) p.cut()

  return p.build()
}

function buildCocinaTicket(order: Order, settings: Settings, config: PrinterConfig): Uint8Array {
  const p = new EscPosBuilder(config.cols)

  if (config.beepOnPrint) p.beep()

  p.center().bold().double()
  p.line(order.notes?.includes('ADICIONAL') ? 'COMANDA ADICIONAL' : 'COMANDA COCINA')
  p.double(false)
  p.line(settings.name)
  p.bold(false)
  p.separator('=')

  p.bold()
  p.line(`#${padOrder(order.number)} · ${formatDateTime(order.createdAt)}`)
  p.bold(false)
  p.left()
  p.line(`${TYPE_LABEL[order.type]}${order.tableNumber ? ` · Mesa ${order.tableNumber}` : ''}`)
  p.line(`Cliente: ${order.customerName}`)
  p.line(`Atendió: ${order.createdBy}`)
  p.separator()

  for (const item of order.items) {
    p.bold().wide()
    p.line(`${item.qty}x ${item.name}`)
    p.wide(false).bold(false)
    if (item.notes) {
      p.line(`   >> ${item.notes}`)
    }
  }

  if (order.notes) {
    p.separator()
    p.bold().line(`NOTA: ${order.notes}`).bold(false)
  }

  p.separator()
  p.center()
  p.line('Preparar con receta de la casa')
  p.feed(2)
  if (config.autoCut) p.cut()

  return p.build()
}

function buildCuentaTicket(order: Order, settings: Settings, config: PrinterConfig): Uint8Array {
  const p = new EscPosBuilder(config.cols)

  p.center().bold().double()
  p.line(settings.name)
  p.double(false).bold(false)
  p.line(settings.address)
  p.separator('=')

  p.bold().line('PRE-CUENTA').bold(false)
  p.line(`${padOrder(order.number)} · ${formatDateTime(order.createdAt)}`)
  p.left()
  p.line(`${TYPE_LABEL[order.type]}${order.tableNumber ? ` · Mesa ${order.tableNumber}` : ''}`)
  p.line(`Cliente: ${order.customerName}`)
  p.separator()

  for (const item of order.items) {
    p.row(`${item.qty}x ${item.name}`, soles(item.qty * item.price))
  }

  p.separator()
  p.row('Subtotal', soles(order.subtotal))
  if (order.discount) p.row('Descuento', `- ${soles(order.discount)}`)
  p.row(`IGV ${(settings.igvRate * 100).toFixed(0)}%`, soles(order.igv))
  p.bold().double()
  p.row('TOTAL', soles(order.total))
  p.double(false).bold(false)

  p.feed(1).center()
  p.line('Acérquese a caja para pagar')
  p.line('Gracias por su preferencia')
  p.feed(2)
  if (config.autoCut) p.cut()

  return p.build()
}

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

export type TicketKind = 'caja' | 'cocina' | 'cuenta'

export function ticketHtml(order: Order, settings: Settings, kind: TicketKind) {
  const heading =
    kind === 'cocina' ? 'COMANDA COCINA' : kind === 'cuenta' ? 'PRE-CUENTA' : 'TICKET DE VENTA'
  const items = order.items
    .map((i) => {
      const line =
        kind === 'cocina'
          ? `<div class="item"><strong>${i.qty}x</strong> ${esc(i.name)}${i.notes ? `<div class="note">** ${esc(i.notes)}</div>` : ''}</div>`
          : `<div class="item"><div class="row"><span>${i.qty}x ${esc(i.name)}</span><span>${esc(soles(i.qty * i.price))}</span></div>${i.notes ? `<div class="note">${esc(i.notes)}</div>` : ''}</div>`
      return line
    })
    .join('')

  const money =
    kind === 'cocina'
      ? ''
      : `<hr class="dash" />
        <div class="row muted"><span>Subtotal</span><span>${esc(soles(order.subtotal))}</span></div>
        ${order.discount ? `<div class="row muted"><span>Descuento</span><span>- ${esc(soles(order.discount))}</span></div>` : ''}
        <div class="row muted"><span>IGV ${(settings.igvRate * 100).toFixed(0)}%</span><span>${esc(soles(order.igv))}</span></div>
        <div class="row big"><span>TOTAL</span><span>${esc(soles(order.total))}</span></div>
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
    <p class="center">${esc(padOrder(order.number))} · ${esc(formatDateTime(order.createdAt))}</p>
    <p>${esc(TYPE_LABEL[order.type])}${order.tableNumber ? ` · Mesa ${order.tableNumber}` : ''}</p>
    <p>Cliente: ${esc(order.customerName)}</p>
    ${order.customerPhone ? `<p>Cel: ${esc(order.customerPhone)}</p>` : ''}
    ${order.address ? `<p>${esc(order.address)}</p>` : ''}
    <p class="muted">Atendió: ${esc(order.createdBy)}</p>
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

function printHtmlFallback(html: string) {
  closePrintPreview()

  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Vista previa de impresión')
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
      #${OVERLAY_ID} [data-close] { background: #fff; color: #111; }
      #${OVERLAY_ID} [data-print] { background: #1a3d1a; color: #fff; }
      #${OVERLAY_ID} iframe { flex: 1 1 auto; width: 100%; border: 0; background: #fff; }
      @media print { #${OVERLAY_ID} { display: none !important; } }
    </style>
    <div class="polleria-print-bar">
      <p>Vista previa</p>
      <button type="button" data-print>Imprimir</button>
      <button type="button" data-close>Cerrar</button>
    </div>
    <iframe title="Documento a imprimir"></iframe>
    <div class="polleria-print-bar">
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

  const doc = iframe?.contentDocument
  if (!iframe || !doc) {
    closePrintPreview()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
}

function getPrinterConfig(settings: Settings, kind: TicketKind): PrinterConfig | null {
  const printers = settings.printers
  if (!printers) return null
  if (kind === 'cocina') return printers.cocina?.enabled ? printers.cocina : null
  return printers.caja?.enabled ? printers.caja : null
}

export async function printTicket(order: Order, settings: Settings, kind: TicketKind) {
  const config = getPrinterConfig(settings, kind)

  if (config && config.driver !== 'browser') {
    let data: Uint8Array
    if (kind === 'cocina') {
      data = buildCocinaTicket(order, settings, config)
    } else if (kind === 'cuenta') {
      data = buildCuentaTicket(order, settings, config)
    } else {
      data = buildCajaTicket(order, settings, config)
    }

    const result = await sendToPrinter(data, config)
    if (result.ok) return

    console.warn(`[Print] ESC/POS falló (${result.error}), usando fallback HTML`)
  }

  printHtmlFallback(ticketHtml(order, settings, kind))
}

export function printReport(html: string) {
  printHtmlFallback(html)
}

// Re-export for backward compatibility
export { printHtmlFallback as printHtml }
