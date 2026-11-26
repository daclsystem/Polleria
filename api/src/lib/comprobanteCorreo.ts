import fs from 'node:fs/promises'
import nodemailer from 'nodemailer'
import { comprobanteContentType, comprobanteFilePath } from './comprobantes.js'

export type CorreoComprobante = {
  orderId: string
  tipo: 'factura' | 'boleta'
  serie: string
  numero: number
  ruc: string
  nombreCdr: string
  para: string
}

function direccionCorreo(valor: unknown) {
  const direccion = typeof valor === 'string' ? valor.trim() : ''
  return direccion.length <= 180 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(direccion)
    ? direccion
    : undefined
}

export function destinatarioComprobante(
  documento: string | undefined,
  pedido: { DocNumero?: string; DocEmail?: string; CustomerEmail?: string } | undefined,
) {
  if (!pedido) return undefined
  const documentoPedido = String(pedido.DocNumero ?? '').replace(/\D/g, '')
  // Si se factura a otro documento, el correo del pedido puede pertenecer a otra persona.
  if (documento && documento !== '-' && documento !== documentoPedido) return undefined
  return direccionCorreo(pedido.DocEmail) ?? direccionCorreo(pedido.CustomerEmail)
}

export function configuracionSmtpComprobantes() {
  const host = process.env.COMPROBANTES_SMTP_HOST?.trim()
  const port = Number(process.env.COMPROBANTES_SMTP_PORT || 587)
  const user = direccionCorreo(process.env.COMPROBANTES_SMTP_USER)
  const pass = process.env.COMPROBANTES_SMTP_PASSWORD
  if (!host || !user || !pass || (port !== 465 && port !== 587)) return undefined
  return { host, port, user, pass }
}

export async function enviarCorreoComprobante(comprobante: CorreoComprobante) {
  const smtp = configuracionSmtpComprobantes()
  if (!smtp) throw new Error('Falta la configuración SMTP de comprobantes.')
  const { host, port, user, pass } = smtp
  const referencia = `${comprobante.serie}-${comprobante.numero}`
  const tipo = comprobante.tipo === 'factura' ? 'Factura' : 'Boleta'
  const nombre = `${comprobante.ruc}-${comprobante.tipo === 'factura' ? '01' : '03'}-${referencia}`
  const attachments = await Promise.all((['pdf', 'xml', 'cdr'] as const).map(async (kind) => {
    const content = await fs.readFile(comprobanteFilePath(comprobante.orderId, kind))
    if (!content.length) throw new Error('El comprobante tiene un adjunto vacío.')
    return {
      filename: kind === 'cdr' ? `R-${comprobante.nombreCdr}.zip` : `${nombre}.${kind}`,
      content,
      contentType: comprobanteContentType(kind),
    }
  }))
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  })

  const result = await transport.sendMail({
    from: { name: 'Pollería López', address: user },
    to: { name: '', address: comprobante.para },
    messageId: `<comprobante-${comprobante.orderId}@${user.split('@')[1]}>`,
    subject: `${tipo} electrónica ${referencia} · Pollería López`,
    text: `Adjuntamos el PDF, el XML y la constancia de recepción de SUNAT de tu ${tipo.toLowerCase()} ${referencia}.\n\nPollería López`,
    attachments,
  })
  if (result.accepted.length !== 1) throw new Error('El servidor SMTP no aceptó el destinatario.')
}
