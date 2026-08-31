/**
 * La configuración de impresoras es de cada equipo, no del local: la PC de caja
 * imprime por USB y la tablet del mozo por RawBT. Por eso se guarda en el
 * navegador y no viaja al API (que además no persiste este campo).
 */

import { getDeviceOS } from './platform'
import { DEFAULT_PRINTER, type PrinterSetup } from '../types'

const KEY = 'polleria.printers.v1'

/** Ticketera de red del local. */
export const LOCAL_PRINTER_ADDRESS = '192.168.18.50:9100'

export function defaultPrinterSetup(): PrinterSetup {
  // En tablet la única vía al puerto 9100 es RawBT: el navegador no abre sockets
  // y Chrome bloquea las peticiones http desde una página https.
  const base = {
    ...DEFAULT_PRINTER,
    driver: getDeviceOS() === 'android' ? ('rawbt' as const) : ('browser' as const),
    networkUrl: LOCAL_PRINTER_ADDRESS,
  }
  return {
    caja: { ...base, id: 'caja', label: 'Impresora Caja', openDrawer: true },
    cocina: { ...base, id: 'cocina', label: 'Impresora Cocina', beepOnPrint: true },
  }
}

export function loadPrinterSetup(): PrinterSetup | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PrinterSetup>
    if (!parsed?.caja || !parsed?.cocina) return null
    const base = defaultPrinterSetup()
    return {
      caja: { ...base.caja, ...parsed.caja },
      cocina: { ...base.cocina, ...parsed.cocina },
    }
  } catch {
    return null
  }
}

export function savePrinterSetup(setup: PrinterSetup) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(setup))
  } catch {
    /* almacenamiento lleno o modo privado: la config vive solo en memoria */
  }
}
