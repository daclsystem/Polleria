import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'node:crypto'

export type ComprobanteKind = 'pdf' | 'xml' | 'cdr'

const KIND_FILE: Record<ComprobanteKind, string> = {
  pdf: 'pdf.pdf',
  xml: 'xml.xml',
  cdr: 'cdr.zip',
}

const KIND_TYPE: Record<ComprobanteKind, string> = {
  pdf: 'application/pdf',
  xml: 'application/xml',
  cdr: 'application/zip',
}

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function comprobantesRoot() {
  return process.env.COMPROBANTES_DIR || path.resolve(process.cwd(), 'storage', 'comprobantes')
}

export function isComprobanteKind(value: string): value is ComprobanteKind {
  return value === 'pdf' || value === 'xml' || value === 'cdr'
}

export function comprobanteFilePath(orderId: string, kind: ComprobanteKind) {
  if (!ORDER_ID.test(orderId)) throw new Error('Pedido inválido')
  return path.join(comprobantesRoot(), orderId, KIND_FILE[kind])
}

/** Guarda el archivo generado para descargarlo después desde el sistema. */
export async function saveComprobanteFile(orderId: string, kind: ComprobanteKind, body: Buffer) {
  const file = comprobanteFilePath(orderId, kind)
  const temporary = `${file}.${randomUUID()}.tmp`
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  try {
    await fs.writeFile(temporary, body, { mode: 0o600 })
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
  return file
}

export function comprobanteContentType(kind: ComprobanteKind) {
  return KIND_TYPE[kind]
}

export async function comprobanteExists(orderId: string, kind: ComprobanteKind) {
  try {
    await fs.access(comprobanteFilePath(orderId, kind))
    return true
  } catch {
    return false
  }
}

export async function listComprobanteFiles() {
  const root = comprobantesRoot()
  const files: Record<string, { pdf: boolean; xml: boolean; cdr: boolean }> = {}
  let names: string[] = []
  try {
    names = await fs.readdir(root)
  } catch {
    return files
  }
  for (const name of names) {
    if (!ORDER_ID.test(name)) continue
    files[name] = {
      pdf: await comprobanteExists(name, 'pdf'),
      xml: await comprobanteExists(name, 'xml'),
      cdr: await comprobanteExists(name, 'cdr'),
    }
  }
  return files
}
