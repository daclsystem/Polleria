import fs from 'node:fs/promises'
import { zipSync } from 'fflate'
import { comprobanteFilePath, type ComprobanteKind } from './comprobantes.js'

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_COMPROBANTES = 200
const MAX_BYTES = 64 * 1024 * 1024

type Invoice = {
  orderId: string
  tipo: 'boleta' | 'factura'
  serie: string
  numero: number
  status?: string
  canal?: string
}

function descargaError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

function normalizarIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== 'string' || !ORDER_ID.test(id))) {
    throw descargaError(400, 'Selecciona comprobantes con pedidos válidos para descargar.')
  }
  const ids = [...new Set((value as string[]).map((id) => id.toLowerCase()))]
  if (ids.length > MAX_COMPROBANTES) throw descargaError(413, 'Puedes descargar hasta 200 comprobantes a la vez.')
  return ids
}

function nombreComprobante(invoice: Invoice) {
  if ((invoice.tipo !== 'boleta' && invoice.tipo !== 'factura') || typeof invoice.serie !== 'string' ||
      !new RegExp(`^${invoice.tipo === 'boleta' ? 'B' : 'F'}[A-Z0-9]{3}$`).test(invoice.serie) ||
      !Number.isSafeInteger(invoice.numero) || invoice.numero < 1 || invoice.numero > 99_999_999) {
    throw descargaError(400, 'El comprobante tiene una serie o numeración inválida.')
  }
  const referencia = `${invoice.serie}-${String(invoice.numero).padStart(8, '0')}`
  return { referencia, carpeta: `${invoice.tipo}-${referencia}` }
}

/** Construye la descarga en memoria; solo incorpora los archivos públicos del comprobante. */
export async function construirDescargaComprobantes(orderIds: unknown, invoices: unknown) {
  const ids = normalizarIds(orderIds)
  if (!Array.isArray(invoices)) throw descargaError(500, 'No se pudo leer el registro de comprobantes.')
  const seleccion = ids.map((id) => {
    const invoice = invoices.find((item): item is Invoice => item && typeof item.orderId === 'string' &&
      ORDER_ID.test(item.orderId) && item.orderId.toLowerCase() === id)
    if (!invoice) throw descargaError(404, 'No se encontró uno de los comprobantes seleccionados.')
    return { invoice, ...nombreComprobante(invoice) }
  })
  if (new Set(seleccion.map(({ carpeta }) => carpeta)).size !== seleccion.length) {
    throw descargaError(409, 'Hay comprobantes con la misma serie y numeración. Descárgalos por separado.')
  }
  const archivos: Record<string, Uint8Array> = {}
  let total = 0
  for (const { invoice, referencia, carpeta } of seleccion) {
    for (const kind of ['pdf', 'xml', 'cdr'] as const satisfies readonly ComprobanteKind[]) {
      if (kind === 'pdf' && invoice.canal === 'sunat' && invoice.status !== 'aceptada') continue
      const archivo = comprobanteFilePath(invoice.orderId, kind)
      let contenido: Buffer
      try {
        const info = await fs.stat(archivo)
        if (total + info.size > MAX_BYTES) throw descargaError(413, 'La descarga supera el límite de 64 MiB. Selecciona menos comprobantes.')
        contenido = await fs.readFile(archivo)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      total += contenido.byteLength
      if (total > MAX_BYTES) throw descargaError(413, 'La descarga supera el límite de 64 MiB. Selecciona menos comprobantes.')
      const nombre = kind === 'cdr' ? `CDR-${referencia}.zip` : `${referencia}.${kind}`
      archivos[`${carpeta}/${nombre}`] = contenido
    }
  }
  if (Object.keys(archivos).length === 0) throw descargaError(404, 'Todavía no hay archivos disponibles para los comprobantes seleccionados.')
  const body = Buffer.from(zipSync(archivos))
  if (body.byteLength > MAX_BYTES) throw descargaError(413, 'La descarga supera el límite de 64 MiB. Selecciona menos comprobantes.')
  return { body, filename: seleccion.length === 1 ? `${seleccion[0].carpeta}.zip` : 'comprobantes.zip' }
}
