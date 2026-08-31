/**
 * Printer drivers: WebUSB (USB directo), Network (vía print-bridge), y browser fallback.
 * Permite imprimir silenciosamente en impresoras térmicas sin diálogo.
 */

import type { PrinterConfig } from '../types'

export type PrintResult = { ok: true } | { ok: false; error: string }

// ─── WebUSB Driver ──────────────────────────────────────────────────────────

let usbDevice: USBDevice | null = null

async function getUsbDevice(config: PrinterConfig): Promise<USBDevice> {
  if (usbDevice && usbDevice.opened) return usbDevice

  const devices = await navigator.usb.getDevices()
  let device = config.usbVendorId
    ? devices.find((d: USBDevice) => d.vendorId === config.usbVendorId)
    : devices[0]

  if (!device) {
    device = await navigator.usb.requestDevice({
      filters: config.usbVendorId
        ? [{ vendorId: config.usbVendorId }]
        : [
            { vendorId: 0x04b8 }, // Epson
            { vendorId: 0x0519 }, // Star Micronics
            { vendorId: 0x0dd4 }, // Custom
            { vendorId: 0x0fe6 }, // Contex / ICS
            { vendorId: 0x1fc9 }, // NXP (generic thermal)
            { vendorId: 0x0483 }, // STMicroelectronics (some Chinese printers)
            { vendorId: 0x1a86 }, // QinHeng (CH340 USB-Serial, common in cheap printers)
          ],
    })
  }

  await device.open()
  if (device.configuration === null) {
    await device.selectConfiguration(1)
  }
  await device.claimInterface(0)
  usbDevice = device
  return device
}

export async function printUsb(data: Uint8Array, config: PrinterConfig): Promise<PrintResult> {
  try {
    const device = await getUsbDevice(config)
    const iface = device.configuration!.interfaces[0]
    const ep = iface.alternate.endpoints.find((e: USBEndpoint) => e.direction === 'out')
    if (!ep) return { ok: false, error: 'No se encontró endpoint de salida USB' }
    await device.transferOut(ep.endpointNumber, data.buffer as ArrayBuffer)
    return { ok: true }
  } catch (e: unknown) {
    usbDevice = null
    return { ok: false, error: (e as Error)?.message ?? 'Error USB desconocido' }
  }
}

export function isWebUsbSupported(): boolean {
  return 'usb' in navigator
}

export async function requestUsbPrinter(): Promise<{ vendorId: number; productId: number; name: string } | null> {
  try {
    const device = await navigator.usb.requestDevice({
      filters: [
        { vendorId: 0x04b8 },
        { vendorId: 0x0519 },
        { vendorId: 0x0dd4 },
        { vendorId: 0x0fe6 },
        { vendorId: 0x1fc9 },
        { vendorId: 0x0483 },
        { vendorId: 0x1a86 },
      ],
    })
    return {
      vendorId: device.vendorId,
      productId: device.productId,
      name: device.productName || `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`,
    }
  } catch {
    return null
  }
}

// ─── Network Driver (via local print-bridge) ────────────────────────────────

/** Acepta `192.168.18.50`, `192.168.18.50:9100` o una URL completa. */
export function normalizeNetworkUrl(raw?: string): string {
  const value = (raw ?? '').trim()
  if (!value) return 'http://localhost:9100'
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`
  try {
    const url = new URL(withScheme)
    if (!url.port) url.port = '9100'
    return url.toString().replace(/\/$/, '')
  } catch {
    return withScheme
  }
}

/**
 * Chrome bloquea peticiones http:// desde una página https:// salvo a localhost.
 * Conviene detectarlo antes de hacer fetch, porque el error nativo es un
 * `TypeError: Failed to fetch` que no dice nada al cajero.
 */
export function blockedByMixedContent(url: string): boolean {
  if (typeof location === 'undefined' || location.protocol !== 'https:') return false
  try {
    const target = new URL(url)
    if (target.protocol !== 'http:') return false
    return !['localhost', '127.0.0.1', '[::1]', '::1'].includes(target.hostname)
  } catch {
    return false
  }
}

export async function printNetwork(data: Uint8Array, config: PrinterConfig): Promise<PrintResult> {
  const url = normalizeNetworkUrl(config.networkUrl)

  if (blockedByMixedContent(url)) {
    return {
      ok: false,
      error: `El navegador bloquea ${url} porque el sistema abre en https. En tablet usa el modo "App RawBT"; en la PC de caja usa USB o un print-bridge con https.`,
    }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data as unknown as BodyInit,
      signal: ctrl.signal,
    })
    if (!res.ok) return { ok: false, error: `El print bridge respondió ${res.status}` }
    return { ok: true }
  } catch (e: unknown) {
    if ((e as Error)?.name === 'AbortError') {
      return { ok: false, error: `Sin respuesta de ${url} (8 s). ¿Está encendido el print bridge?` }
    }
    return {
      ok: false,
      error: `No se pudo conectar a ${url}. El puerto 9100 de la impresora no habla HTTP: hace falta un print-bridge, o usa el modo "App RawBT".`,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─── RawBT Driver (app Android que sí puede abrir el puerto 9100) ───────────

export const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter'
export const RAWBT_STORE_URL = `https://play.google.com/store/apps/details?id=${RAWBT_PACKAGE}`

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** Espera entre tickets: RawBT atiende una intención a la vez. */
const RAWBT_GAP_MS = 1200

let rawbtFrame: HTMLIFrameElement | null = null
let rawbtQueue: Promise<void> = Promise.resolve()

/**
 * Se navega dentro de un iframe oculto y no en `window.location`: si la tablet no
 * tuviera RawBT instalado, Chrome mostraría ERR_UNKNOWN_URL_SCHEME y el POS
 * perdería la pantalla en plena atención.
 */
function openRawbtUri(uri: string) {
  if (!rawbtFrame?.isConnected) {
    rawbtFrame = document.createElement('iframe')
    rawbtFrame.setAttribute('aria-hidden', 'true')
    rawbtFrame.title = 'RawBT'
    rawbtFrame.style.cssText =
      'position:fixed;left:-9999px;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
    document.body.appendChild(rawbtFrame)
  }
  rawbtFrame.src = uri
}

/**
 * RawBT registra el esquema `rawbt:` en Android y reenvía los bytes crudos a la
 * impresora configurada dentro de la app (Bluetooth, USB o IP:9100). El navegador
 * no puede saber si la app existe ni si imprimió, así que esto siempre reporta
 * éxito; el ticket en papel es la confirmación.
 */
export function printRawbt(data: Uint8Array): Promise<PrintResult> {
  const uri = `rawbt:base64,${bytesToBase64(data)}`
  // Comanda de cocina y ticket de caja salen casi a la vez: si se lanzan las dos
  // intenciones seguidas, la segunda pisa a la primera y solo imprime una.
  const job = rawbtQueue.then(async () => {
    openRawbtUri(uri)
    await new Promise((resolve) => setTimeout(resolve, RAWBT_GAP_MS))
  })
  rawbtQueue = job.catch(() => {})
  return job.then(
    () => ({ ok: true }) as PrintResult,
    (e: unknown) => ({ ok: false, error: (e as Error)?.message ?? 'No se pudo abrir RawBT' }) as PrintResult,
  )
}

// ─── Unified print dispatch ─────────────────────────────────────────────────

export async function sendToPrinter(data: Uint8Array, config: PrinterConfig): Promise<PrintResult> {
  if (config.driver === 'usb') {
    return printUsb(data, config)
  }
  if (config.driver === 'network') {
    return printNetwork(data, config)
  }
  if (config.driver === 'rawbt') {
    return printRawbt(data)
  }
  return { ok: false, error: 'Driver no configurado' }
}

export async function disconnectUsb() {
  if (usbDevice) {
    try { await usbDevice.close() } catch { /* ok */ }
    usbDevice = null
  }
}
