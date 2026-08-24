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

export async function printNetwork(data: Uint8Array, config: PrinterConfig): Promise<PrintResult> {
  const url = config.networkUrl || 'http://localhost:9100'
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data as unknown as BodyInit,
    })
    if (!res.ok) return { ok: false, error: `Print bridge respondió ${res.status}` }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message ?? 'No se pudo conectar al print bridge' }
  }
}

// ─── Unified print dispatch ─────────────────────────────────────────────────

export async function sendToPrinter(data: Uint8Array, config: PrinterConfig): Promise<PrintResult> {
  if (config.driver === 'usb') {
    return printUsb(data, config)
  }
  if (config.driver === 'network') {
    return printNetwork(data, config)
  }
  return { ok: false, error: 'Driver no configurado' }
}

export async function disconnectUsb() {
  if (usbDevice) {
    try { await usbDevice.close() } catch { /* ok */ }
    usbDevice = null
  }
}
