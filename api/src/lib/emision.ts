import { randomInt } from 'crypto'
import fs from 'node:fs/promises'
import forge from 'node-forge'
import { getPool, sql } from '../db.js'
import { emitEvent } from '../realtime.js'
import { certificadoInfo, leerCertificado } from './certificado.js'
import { configuracionSmtpComprobantes, destinatarioComprobante, enviarCorreoComprobante, type CorreoComprobante } from './comprobanteCorreo.js'
import { comprobanteFilePath, saveComprobanteFile } from './comprobantes.js'
import { loadIgvRate, round2 } from './money.js'
import {
  getBoletaSummaryStatus, getFacturaCdr, getFacturaEstado, parseCdr, pkcs12SigningKeys, sendBill, sendBoletaSummary,
  signedBoletaSummary, signedInvoice, type SunatDocument,
} from './sunat.js'
import { comprobantePdf } from './sunatPdf.js'

const CAMPOS_SUNAT = [
  'ruc', 'razonSocial', 'direccionFiscal', 'establecimiento', 'usuario', 'serieboleta', 'seriefactura',
] as const

type SunatConfig = Partial<Record<(typeof CAMPOS_SUNAT)[number] | 'clave', string>>

type EmitLine = { descripcion: string; cantidad: number; precio: number }
type PedidoBeta = { numero: number; total: number; tasa: number }
export type EmisorBeta = Pick<SunatConfig, 'ruc' | 'razonSocial' | 'direccionFiscal' | 'establecimiento' | 'serieboleta' | 'seriefactura'>
const PEDIDO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EmitInput = {
  orderId: string
  tipo: 'boleta' | 'factura'
  cliente: { tipDoc: string; num: string; nombre: string; direccion?: string }
  lines: EmitLine[]
}

type Invoice = {
  orderId: string
  tipo: 'boleta' | 'factura'
  serie: string
  numero: number
  status: 'aceptada' | 'rechazada' | 'pendiente'
  fechaEmision: string
  hashCdr?: string
  mensaje?: string
  clienteDoc?: string
  clienteNombre?: string
  canal?: 'sunat'
  rucEmisor?: string
  resumen?: { nombre: string; ticket?: string }
  sunatCode?: string
  nextRetryAt?: string
  lastSentAt?: string
}

type EnvioCorreo = CorreoComprobante & {
  estado: 'pendiente' | 'enviando' | 'enviado' | 'fallido' | 'sin_confirmar'
  intentos: number
  siguienteIntento: number
  inicio?: number
}

const ESPERA_SUNAT_0140 = 15 * 60 * 1000
const COLA_CORREOS = 'sunat_correos'
const ESPERA_CORREO = 5 * 60 * 1000

function mensajeEsperaSunat(nextRetryAt: string, sunatCode?: string) {
  const hora = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(nextRetryAt))
  const motivo = sunatCode === '0140' ? 'SUNAT 0140: hay un documento igual en proceso.' : 'El envío anterior todavía no está confirmado.'
  return `${motivo} Espera hasta ${hora} (hora de Lima) para consultar nuevamente.`
}

async function readConfig<T>(key: string, tx?: sql.Transaction): Promise<T | null> {
  const request = tx ? new sql.Request(tx) : (await getPool()).request()
  const r = await request.input('key', sql.NVarChar, key).query(`SELECT ConfigValue FROM dbo.AppConfig WHERE ConfigKey=@key`)
  const raw = r.recordset[0]?.ConfigValue
  if (!raw) return null
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    if (key === 'invoices') throw new Error('No se pudo leer el registro de comprobantes.')
    return null
  }
}

async function writeConfig(key: string, value: unknown, tx?: sql.Transaction) {
  const request = tx ? new sql.Request(tx) : (await getPool()).request()
  await request
    .input('key', sql.NVarChar, key)
    .input('value', sql.NVarChar(sql.MAX), JSON.stringify(value ?? {}))
    .query(`
      MERGE dbo.AppConfig AS t
      USING (SELECT @key AS ConfigKey) AS s
      ON t.ConfigKey = s.ConfigKey
      WHEN MATCHED THEN UPDATE SET ConfigValue=@value, UpdatedAt=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (ConfigKey, ConfigValue) VALUES (@key, @value);
    `)
}

async function withInvoiceLock<T>(work: (tx: sql.Transaction) => Promise<T>) {
  const tx = new sql.Transaction(await getPool())
  await tx.begin()
  try {
    const lock = await new sql.Request(tx).query(`
      DECLARE @result int;
      EXEC @result = sys.sp_getapplock
        @Resource = N'Polleria.Comprobantes', @LockMode = 'Exclusive',
        @LockOwner = 'Transaction', @LockTimeout = 5000;
      SELECT @result AS Result;
    `)
    if (!(lock.recordset[0]?.Result >= 0)) {
      throw Object.assign(new Error('Hay una emisión en curso. Intenta nuevamente en unos segundos.'), { status: 409 })
    }
    const result = await work(tx)
    await tx.commit()
    return result
  } catch (error) {
    await tx.rollback().catch(() => undefined)
    throw error
  }
}

async function readInvoices(tx: sql.Transaction) {
  const invoices = await readConfig<Invoice[]>('invoices', tx)
  if (invoices !== null && !Array.isArray(invoices)) throw new Error('El registro de comprobantes no es una lista.')
  return invoices ?? []
}

async function leerCorreos(tx: sql.Transaction) {
  const correos = await readConfig<EnvioCorreo[]>(COLA_CORREOS, tx)
  if (correos !== null && !Array.isArray(correos)) throw new Error('La cola de correos no es una lista.')
  return correos ?? []
}

async function prepararCorreo(invoice: Invoice, nombreCdr: string, tx: sql.Transaction) {
  if (!configuracionSmtpComprobantes() || !invoice.rucEmisor) return
  const { recordset } = await new sql.Request(tx)
    .input('id', sql.UniqueIdentifier, invoice.orderId)
    .query<{ DocNumero?: string; DocEmail?: string; CustomerEmail?: string }>(`
      SELECT o.DocNumero, o.DocEmail, c.Email AS CustomerEmail
      FROM dbo.Orders o
      LEFT JOIN dbo.Customers c ON c.Id = o.CustomerId
      WHERE o.Id = @id
    `)
  const para = destinatarioComprobante(invoice.clienteDoc, recordset[0])
  if (!para) return
  const correos = await leerCorreos(tx)
  if (correos.some((correo) => correo.orderId === invoice.orderId)) return
  correos.push({
    orderId: invoice.orderId, tipo: invoice.tipo, serie: invoice.serie, numero: invoice.numero,
    ruc: invoice.rucEmisor, nombreCdr, para, estado: 'pendiente', intentos: 0, siguienteIntento: Date.now(),
  })
  await writeConfig(COLA_CORREOS, correos, tx)
}

async function tomarCorreo() {
  return withInvoiceLock(async (tx) => {
    const correos = await leerCorreos(tx)
    const ahora = Date.now()
    const interrumpidos = correos.filter((correo) => correo.estado === 'enviando' && (correo.inicio ?? 0) <= ahora - ESPERA_CORREO)
    // Si el proceso se interrumpió durante SMTP, el servidor pudo haber aceptado el mensaje.
    for (const correo of interrumpidos) correo.estado = 'sin_confirmar'
    const siguiente = correos.find((correo) => correo.estado === 'pendiente' && correo.siguienteIntento <= ahora)
    if (siguiente) Object.assign(siguiente, { estado: 'enviando', inicio: ahora, intentos: siguiente.intentos + 1 })
    if (siguiente || interrumpidos.length) await writeConfig(COLA_CORREOS, correos, tx)
    return siguiente
  })
}

export async function procesarCorreosComprobantes() {
  if (!configuracionSmtpComprobantes()) return
  for (let procesados = 0; procesados < 5; procesados++) {
    const correo = await tomarCorreo()
    if (!correo) return
    let estado: EnvioCorreo['estado'] = 'enviado'
    try {
      await enviarCorreoComprobante(correo)
    } catch (error) {
      const { responseCode, command, code } = error as { responseCode?: number; command?: string; code?: string }
      const rechazoTemporal = responseCode !== undefined && responseCode >= 400 && responseCode < 500
      const sinConexion = command === 'CONN' && (code === 'ECONNECTION' || code === 'ETIMEDOUT')
      if (rechazoTemporal || sinConexion) estado = correo.intentos < 3 ? 'pendiente' : 'fallido'
      else estado = command === 'DATA' && responseCode === undefined ? 'sin_confirmar' : 'fallido'
      console.warn(`[comprobantes-correo] ${correo.serie}-${correo.numero}: ${estado}`)
    }
    await withInvoiceLock(async (tx) => {
      const correos = await leerCorreos(tx)
      const actual = correos.find((item) => item.orderId === correo.orderId)
      if (!actual || actual.inicio !== correo.inicio || actual.estado !== 'enviando') return
      actual.estado = estado
      if (estado === 'pendiente') actual.siguienteIntento = Date.now() + ESPERA_CORREO
      await writeConfig(COLA_CORREOS, correos, tx)
    })
  }
}

export function iniciarCorreoComprobantes() {
  if (!configuracionSmtpComprobantes()) return
  let procesando = false
  const timer = setInterval(() => {
    if (procesando) return
    procesando = true
    void procesarCorreosComprobantes()
      .catch(() => console.warn('[comprobantes-correo] No se pudo procesar la cola de correo.'))
      .finally(() => { procesando = false })
  }, 15_000)
  timer.unref()
}

export async function guardarComprobantes(incoming: Invoice[]) {
  await withInvoiceLock(async (tx) => {
    const directos = (await readInvoices(tx)).filter((invoice) => invoice?.canal === 'sunat')
    const ids = new Set(directos.map((invoice) => invoice.orderId))
    const legacy = incoming.filter((invoice) => invoice && invoice.canal !== 'sunat' && !ids.has(invoice.orderId))
    await writeConfig('invoices', [...directos, ...legacy], tx)
  })
}

export async function estadoEmision() {
  const config = await readConfig<SunatConfig>('sunat')
  let motivo = ''
  if (!config || !datosEmisorCompletos(config)) {
    motivo = 'Completa los datos del emisor, las series y el acceso SOL en Configurar SUNAT.'
  } else {
    try {
      const { archivo, clave } = await leerCertificado()
      pkcs12SigningKeys(archivo, clave)
    } catch (error) {
      motivo = (error as Error).message
    }
  }
  const configurada = !motivo
  return { activa: configurada, directa: true, configurada, disponible: configurada, requiereLicencia: false, motivo }
}

export async function configuracionSunat() {
  const [saved, cert] = await Promise.all([readConfig<SunatConfig>('sunat'), certificadoInfo()])
  const config = Object.fromEntries(CAMPOS_SUNAT.map((field) => [field, saved?.[field] ?? '']))
  return {
    ...config,
    claveSolGuardada: Boolean(saved?.clave),
    certificadoCargado: cert.cargado,
    certificadoNombre: cert.nombre,
  }
}

export async function guardarConfiguracionSunat(incoming: Record<string, unknown>) {
  return withInvoiceLock(async (tx) => {
    // Los ajustes existentes y las credenciales de consultas se conservan al guardar los datos de emisión.
    const config = { ...await readConfig<SunatConfig>('sunat', tx) }
    for (const field of CAMPOS_SUNAT) {
      const value = incoming[field]
      if (typeof value === 'string') config[field] = value.trim()
    }
    if (typeof incoming.clave === 'string' && incoming.clave.trim()) config.clave = incoming.clave.trim()
    await writeConfig('sunat', config, tx)
  })
}

/** Compatibilidad con clientes anteriores: la configuración válida habilita la emisión sin key. */
export async function activarEmision() {
  const estado = await estadoEmision()
  if (!estado.disponible) throw Object.assign(new Error(estado.motivo), { status: 400 })
}

function fechaLima(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}-05:00`
}

function grupo(n: number) {
  const u = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
  const e = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const d = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const c = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']
  if (n === 100) return 'CIEN'
  const cent = Math.floor(n / 100)
  const rest = n % 100
  const dec = Math.floor(rest / 10)
  const uni = rest % 10
  let tail = ''
  if (rest < 10) tail = u[rest]
  else if (rest < 20) tail = e[rest - 10]
  else if (rest < 30) tail = uni ? `VEINTI${u[uni]}` : 'VEINTE'
  else tail = uni ? `${d[dec]} Y ${u[uni]}` : d[dec]
  return [c[cent], tail].filter(Boolean).join(' ')
}

function solesEnLetras(total: number) {
  const fijo = round2(total)
  const entero = Math.floor(fijo + 1e-6)
  const cents = String(Math.round((fijo - entero) * 100)).padStart(2, '0')
  const millones = Math.floor(entero / 1_000_000)
  const miles = Math.floor((entero % 1_000_000) / 1000)
  const resto = entero % 1000
  const parts: string[] = []
  if (millones) parts.push(millones === 1 ? 'UN MILLON' : `${grupo(millones)} MILLONES`)
  if (miles) parts.push(miles === 1 ? 'MIL' : `${grupo(miles)} MIL`)
  if (resto) parts.push(grupo(resto))
  const texto = (parts.join(' ') || 'CERO').replace(/UNO$/, 'UN')
  return `SON ${texto} CON ${cents}/100 SOLES`
}

function siguienteNumero(invoices: Invoice[], serie: string) {
  const usados = invoices.filter((inv) => inv?.serie?.toUpperCase() === serie.toUpperCase()).map((inv) => Number(inv.numero) || 0)
  return (usados.length ? Math.max(...usados) : 0) + 1
}

function datosEmisorCompletos(config: SunatConfig) {
  return /^\d{11}$/.test(String(config.ruc || '').trim()) &&
    String(config.razonSocial || '').trim().length >= 2 &&
    String(config.direccionFiscal || '').trim().length >= 5 &&
    /^\d{4}$/.test(String(config.establecimiento || '0000').trim()) &&
    /^B[A-Z0-9]{3}$/i.test(String(config.serieboleta || 'B001').trim()) &&
    /^F[A-Z0-9]{3}$/i.test(String(config.seriefactura || 'F001').trim()) &&
    /^[a-z0-9_.@-]{1,60}$/i.test(String(config.usuario || '').trim()) &&
    Boolean(String(config.clave || '').trim())
}

function datosSunat(tipo: EmitInput['tipo'], config: SunatConfig, total: number, cliente: EmitInput['cliente'], lines: EmitLine[], rate: number) {
  const ruc = String(config.ruc || '').trim()
  const razonSocial = String(config.razonSocial || '').trim()
  const direccionFiscal = String(config.direccionFiscal || '').trim()
  const establecimiento = String(config.establecimiento || '0000').trim()
  const serie = String(tipo === 'factura' ? config.seriefactura || 'F001' : config.serieboleta || 'B001').trim().toUpperCase()
  const serieValida = tipo === 'factura' ? /^F[A-Z0-9]{3}$/ : /^B[A-Z0-9]{3}$/
  const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 })
  if (!/^\d{11}$/.test(ruc) || razonSocial.length < 2 || direccionFiscal.length < 5 || !/^\d{4}$/.test(establecimiento)) {
    throw badRequest('Completa el RUC, la razón social, la dirección fiscal y el código de establecimiento en Configurar SUNAT.')
  }
  if (!serieValida.test(serie)) throw badRequest('Usa una serie de cuatro caracteres que empiece con F para factura o B para boleta.')
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw badRequest('Revisa la tasa de IGV en Ajustes.')
  const lineas = lines.map((line) => {
    const { cantidad, precio } = line
    const bruto = round2(cantidad * precio)
    if (!Number.isFinite(cantidad) || !Number.isFinite(precio) || cantidad <= 0 ||
        cantidad !== Number(cantidad.toFixed(3)) || precio <= 0 || !Number.isFinite(bruto) || bruto <= 0) {
      throw badRequest('Cada línea necesita una cantidad válida de hasta tres decimales y un precio positivo.')
    }
    const base = round2(bruto / (1 + rate))
    return { descripcion: line.descripcion.trim().slice(0, 500), cantidad, precio, base, igv: round2(bruto - base) }
  })
  const base = round2(lineas.reduce((sum, line) => sum + line.base, 0))
  const igv = round2(lineas.reduce((sum, line) => sum + line.igv, 0))
  if (round2(base + igv) !== total) {
    throw badRequest(`El detalle debe sumar exactamente S/ ${total.toFixed(2)}, el importe pagado del pedido.`)
  }
  const identificado = tipo === 'factura' || cliente.tipDoc === '1' || cliente.tipDoc === '6'
  const documento = identificado ? String(cliente.num || '').trim() : '-'
  const nombre = identificado ? String(cliente.nombre || '').trim() : 'CLIENTES VARIOS'
  const tipoDocumento = tipo === 'factura' || cliente.tipDoc === '6' ? '6' : cliente.tipDoc === '1' ? '1' : '-'
  if ((identificado && (nombre.length < 2 || !(tipoDocumento === '6' ? /^\d{11}$/ : /^\d{8}$/).test(documento))) ||
      (tipo === 'boleta' && total > 700 && !identificado)) {
    throw badRequest('Completa el documento y el nombre del cliente para este comprobante.')
  }
  return {
    ruc, razonSocial: razonSocial.slice(0, 100), direccionFiscal: direccionFiscal.slice(0, 200), establecimiento,
    tipo: tipo === 'factura' ? '01' : '03',
    serie, cliente: { tipo: tipoDocumento, documento, nombre: nombre.slice(0, 100) }, lineas, tasa: round2(rate * 100),
    base, igv, total, totalLetras: solesEnLetras(total),
  } satisfies Omit<SunatDocument, 'numero' | 'fecha'>
}

function credencialesSunat(config: SunatConfig, ruc: string) {
  const usuario = String(config.usuario || '').trim()
  const clave = String(config.clave || '').trim()
  if (!/^[a-z0-9_.@-]{1,60}$/i.test(usuario) || !clave) {
    throw Object.assign(new Error('Completa el usuario secundario y la clave SOL en Configurar SUNAT.'), { status: 400 })
  }
  return { ruc, usuario, clave }
}

function nombreSunat(invoice: Invoice) {
  return [invoice.rucEmisor, invoice.tipo === 'factura' ? '01' : '03', invoice.serie, invoice.numero].join('-')
}

function nombreResumen(document: SunatDocument, invoices: Invoice[]) {
  const prefijo = `${document.ruc}-RC-${document.fecha.slice(0, 10).replaceAll('-', '')}-`
  const usados = invoices.reduce((max, invoice) => {
    const nombre = invoice?.resumen?.nombre
    return nombre?.startsWith(prefijo) ? Math.max(max, Number(nombre.slice(prefijo.length)) || 0) : max
  }, 0)
  const numero = usados + 1
  if (numero > 99_999) throw new Error('Se agotó la numeración diaria de resúmenes SUNAT.')
  return `${prefijo}${numero}`
}

async function consultarResumen(invoice: Invoice, resumen: NonNullable<Invoice['resumen']>, auth: ReturnType<typeof credencialesSunat>) {
  const ticketGuardado = resumen.ticket || await fs.readFile(comprobanteFilePath(invoice.orderId, 'ticket'), 'utf8')
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return ''
    })
  if (!ticketGuardado) {
    const xml = await fs.readFile(comprobanteFilePath(invoice.orderId, 'resumen'))
    const ticket = await sendBoletaSummary('produccion', auth, resumen.nombre, xml)
    resumen.ticket = ticket
    await saveComprobanteFile(invoice.orderId, 'ticket', Buffer.from(ticket))
    invoice.mensaje = `Resumen enviado. SUNAT asignó el ticket ${ticket}.`
    return null
  }
  resumen.ticket = ticketGuardado
  const cdr = await getBoletaSummaryStatus('produccion', auth, resumen.nombre, ticketGuardado)
  if (!cdr) invoice.mensaje = `SUNAT está procesando el resumen. Ticket ${ticketGuardado}.`
  return cdr
}

async function enviarFacturaReservada(invoice: Invoice, auth: ReturnType<typeof credencialesSunat>, nombre: string) {
  const xml = await fs.readFile(comprobanteFilePath(invoice.orderId, 'xml'))
  delete invoice.sunatCode
  delete invoice.nextRetryAt
  invoice.lastSentAt = new Date().toISOString()
  return sendBill('produccion', auth, nombre, xml)
}

async function recibirSunat(orderId: string, config: SunatConfig, primerEnvio = false) {
  const invoice = await withInvoiceLock(async (tx) => {
    const invoices = await readInvoices(tx)
    const invoice = invoices.find((item) => item?.orderId === orderId)
    if (!invoice?.rucEmisor || invoice.canal !== 'sunat') throw new Error('No se encontró el comprobante reservado.')
    if (invoice.status !== 'pendiente') return invoice
    if (invoice.rucEmisor !== String(config.ruc || '').trim()) {
      throw Object.assign(new Error('El comprobante pendiente corresponde a otro RUC.'), { status: 409 })
    }
    const resumen = invoice.resumen
    const nombre = resumen?.nombre || nombreSunat(invoice)
    const auth = credencialesSunat(config, invoice.rucEmisor)
    // Si la base de datos falló después de recibir el CDR, recupera la constancia antes de reenviar.
    let cdr = await fs.readFile(comprobanteFilePath(orderId, 'cdr'))
      .then((zip) => parseCdr(zip, nombre))
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
        return null
      })
    if (!cdr) {
      // Los pendientes antiguos solo conservaban el mensaje, sin hora del último intento.
      if ((invoice.sunatCode === '0140' || /\bSUNAT\s+0140\b/.test(invoice.mensaje || '')) && !invoice.nextRetryAt) {
        invoice.sunatCode = '0140'
        invoice.nextRetryAt = new Date(Date.now() + ESPERA_SUNAT_0140).toISOString()
      }
      if (invoice.nextRetryAt && Date.parse(invoice.nextRetryAt) > Date.now()) {
        invoice.mensaje = mensajeEsperaSunat(invoice.nextRetryAt, invoice.sunatCode)
        await writeConfig('invoices', invoices, tx)
        return invoice
      }
      try {
        if (resumen) {
          cdr = await consultarResumen(invoice, resumen, auth)
        } else if (invoice.tipo === 'factura') {
          if (primerEnvio) {
            cdr = await enviarFacturaReservada(invoice, auth, nombre)
          } else {
            const consulta = await getFacturaCdr(auth, nombre)
            cdr = consulta.cdr
            if (!cdr) {
              const estado = await getFacturaEstado(auth, nombre)
              invoice.mensaje = `Consulta SUNAT ${estado.codigo}: ${estado.mensaje || 'la constancia todavía no está disponible'}. La factura sigue pendiente; no se volvió a enviar.`
              // Solo la inexistencia confirmada permite recuperar un envío que no llegó.
              if (estado.codigo === '0011') {
                delete invoice.sunatCode
                const anterior = Date.parse(invoice.lastSentAt || invoice.fechaEmision)
                const siguienteEnvio = (Number.isFinite(anterior) ? anterior : Date.now()) + ESPERA_SUNAT_0140
                if (siguienteEnvio > Date.now()) {
                  invoice.nextRetryAt = new Date(siguienteEnvio).toISOString()
                  invoice.mensaje = mensajeEsperaSunat(invoice.nextRetryAt, invoice.sunatCode)
                } else {
                  cdr = await enviarFacturaReservada(invoice, auth, nombre)
                }
              }
            }
          }
        } else {
          invoice.mensaje = 'Verifica el envío anterior en SUNAT antes de volver a informar la boleta.'
        }
      } catch (error) {
        invoice.mensaje = (error as Error).message || 'SUNAT aún no confirmó el envío.'
        invoice.sunatCode = (error as Error & { sunatCode?: string }).sunatCode
        if (invoice.sunatCode === '0140') {
          invoice.nextRetryAt = new Date(Date.now() + ESPERA_SUNAT_0140).toISOString()
          invoice.mensaje = mensajeEsperaSunat(invoice.nextRetryAt, invoice.sunatCode)
        } else {
          delete invoice.nextRetryAt
        }
      }
      if (!cdr) {
        await writeConfig('invoices', invoices, tx)
        return invoice
      }
      await saveComprobanteFile(orderId, 'cdr', cdr.zip)
    }
    invoice.status = Number(cdr.code) === 0 ? 'aceptada' : 'rechazada'
    invoice.mensaje = cdr.message || `SUNAT ${cdr.code}`
    delete invoice.sunatCode
    delete invoice.nextRetryAt
    if (invoice.status === 'aceptada') await prepararCorreo(invoice, nombre, tx)
    await writeConfig('invoices', invoices, tx)
    return invoice
  })
  emitEvent('invoice:updated', invoice, ['ops', 'caja'])
  return invoice
}

let consultandoPendientesSunat = false
let seguimientoSunat: ReturnType<typeof setInterval> | undefined

/** Recupera resultados sin reenviar documentos ni mantener bloqueada la caja durante la consulta. */
export async function procesarPendientesSunat() {
  if (consultandoPendientesSunat) return
  consultandoPendientesSunat = true
  try {
    const config = await readConfig<SunatConfig>('sunat')
    if (!config || !datosEmisorCompletos(config)) return
    const auth = credencialesSunat(config, String(config.ruc).trim())
    const invoices = await readConfig<Invoice[]>('invoices')
    if (invoices !== null && !Array.isArray(invoices)) throw new Error('El registro de comprobantes no es una lista.')
    const pendientes = (invoices ?? []).filter((invoice) =>
      invoice?.canal === 'sunat' && invoice.status === 'pendiente' && invoice.rucEmisor === auth.ruc)
    // Las consultas avanzan en paralelo; los guardados locales conservan su orden y el bloqueo SQL.
    let persistencia = Promise.resolve()
    const consultar = async (pendiente: Invoice) => {
      const nombre = pendiente.resumen?.nombre || nombreSunat(pendiente)
      let cdr: ReturnType<typeof parseCdr> | null = null
      let mensaje = ''
      let ticket = pendiente.resumen?.ticket
      try {
        cdr = await fs.readFile(comprobanteFilePath(pendiente.orderId, 'cdr'))
          .then((zip) => parseCdr(zip, nombre))
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error
            return null
          })
        // Una constancia ya recibida se recupera incluso durante la espera de otro intento.
        if (!cdr && pendiente.nextRetryAt && Date.parse(pendiente.nextRetryAt) > Date.now()) return
        if (!cdr && pendiente.resumen) {
          ticket ||= await fs.readFile(comprobanteFilePath(pendiente.orderId, 'ticket'), 'utf8')
            .catch((error: NodeJS.ErrnoException) => {
              if (error.code !== 'ENOENT') throw error
              return ''
            })
          // Un envío sin ticket requiere su flujo de recuperación; el seguimiento solo consulta.
          if (!ticket) return
          cdr = await getBoletaSummaryStatus('produccion', auth, nombre, ticket)
          if (!cdr) mensaje = `SUNAT está procesando el resumen. Ticket ${ticket}.`
        } else if (!cdr && pendiente.tipo === 'factura') {
          const consulta = await getFacturaCdr(auth, nombre)
          cdr = consulta.cdr
          if (!cdr) mensaje = `Consulta SUNAT ${consulta.codigo}: ${consulta.mensaje || 'la constancia todavía no está disponible'}. La factura sigue pendiente; no se volvió a enviar.`
        } else if (!cdr) {
          return
        }
      } catch (error) {
        mensaje = (error as Error).message || 'SUNAT aún no confirmó el envío.'
      }
      try {
        const guardar = persistencia.then(() => withInvoiceLock(async (tx) => {
          const actuales = await readInvoices(tx)
          const actual = actuales.find((item) => item?.orderId === pendiente.orderId)
          if (!actual || actual.status !== 'pendiente' || actual.canal !== 'sunat' ||
              actual.rucEmisor !== pendiente.rucEmisor || actual.serie !== pendiente.serie || actual.numero !== pendiente.numero ||
              actual.resumen?.nombre !== pendiente.resumen?.nombre) return null
          // No sustituye un reintento manual más reciente por el error de una consulta anterior.
          if (!cdr && JSON.stringify(actual) !== JSON.stringify(pendiente)) return null
          const antes = JSON.stringify(actual)
          if (actual.resumen && ticket) actual.resumen.ticket = ticket
          if (cdr) {
            await saveComprobanteFile(actual.orderId, 'cdr', cdr.zip)
            actual.status = Number(cdr.code) === 0 ? 'aceptada' : 'rechazada'
            actual.mensaje = cdr.message || `SUNAT ${cdr.code}`
            delete actual.sunatCode
            delete actual.nextRetryAt
            if (actual.status === 'aceptada') await prepararCorreo(actual, nombre, tx)
          } else {
            actual.mensaje = mensaje
          }
          if (JSON.stringify(actual) === antes) return null
          await writeConfig('invoices', actuales, tx)
          return actual
        }))
        // Un fallo de persistencia de un comprobante no impide guardar el siguiente resultado.
        persistencia = guardar.then(() => undefined, () => undefined)
        const actualizada = await guardar
        if (actualizada) emitEvent('invoice:updated', actualizada, ['ops', 'caja'])
      } catch {
        console.warn(`[sunat-pendientes] No se pudo guardar el resultado de ${pendiente.serie}-${pendiente.numero}.`)
      }
    }
    let siguiente = 0
    await Promise.all(Array.from({ length: Math.min(3, pendientes.length) }, async () => {
      while (siguiente < pendientes.length) {
        const pendiente = pendientes[siguiente++]
        await consultar(pendiente)
      }
    }))
  } finally {
    consultandoPendientesSunat = false
  }
}

export function iniciarSeguimientoSunat() {
  if (seguimientoSunat) return
  const consultar = () => void procesarPendientesSunat()
    .catch(() => console.warn('[sunat-pendientes] No se pudieron consultar los comprobantes pendientes.'))
  seguimientoSunat = setInterval(consultar, 5_000)
  seguimientoSunat.unref()
  consultar()
}

async function emitirDirecto(input: EmitInput, config: SunatConfig, tipo: EmitInput['tipo'], lines: EmitLine[], cliente: EmitInput['cliente']) {
  if (!datosEmisorCompletos(config)) {
    throw Object.assign(new Error('Completa los datos de emisión en Configurar SUNAT.'), { status: 400 })
  }
  const orderId = input.orderId.toLowerCase()
  const ruc = String(config.ruc || '').trim()
  credencialesSunat(config, ruc)

  const { invoice, nuevo } = await withInvoiceLock(async (tx) => {
    const invoices = await readInvoices(tx)
    const existing = invoices.find((item) => item?.orderId?.toLowerCase() === orderId)
    if (existing) return { invoice: existing, nuevo: false }
    const result = await new sql.Request(tx).input('id', sql.UniqueIdentifier, orderId).query(`
      SELECT Paid, Status, Total, DocTipo FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE Id = @id
    `)
    const order = result.recordset[0]
    if (!order?.Paid || /^(cancelad[oa]|eliminad[oa]|anulad[oa])$/i.test(order.Status) || !(Number(order.Total) > 0)) {
      throw Object.assign(new Error('El comprobante requiere un pedido pagado y vigente.'), { status: 400 })
    }
    if (String(order.DocTipo || '').toLowerCase() === 'factura' && tipo !== 'factura') {
      throw Object.assign(new Error('El pedido requiere una factura.'), { status: 400 })
    }
    const data = datosSunat(tipo, config, Number(order.Total), cliente, lines, await loadIgvRate(tx))
    const numero = siguienteNumero(invoices, data.serie)
    if (!Number.isSafeInteger(numero) || numero < 1 || numero > 99_999_999) throw new Error('El correlativo SUNAT queda fuera de rango.')
    const now = new Date()
    const document = { ...data, numero, fecha: fechaLima(now) }
    const { archivo, clave } = await leerCertificado()
    const keys = pkcs12SigningKeys(archivo, clave)
    const { xml, digest } = signedInvoice(document, keys)
    const pdf = await comprobantePdf(document, digest)
    await saveComprobanteFile(orderId, 'xml', xml)
    await saveComprobanteFile(orderId, 'pdf', pdf)
    const resumen = tipo === 'boleta' ? { nombre: nombreResumen(document, invoices) } : undefined
    if (resumen) await saveComprobanteFile(orderId, 'resumen', signedBoletaSummary(document, resumen.nombre.slice(12), keys))
    const reserved: Invoice = {
      orderId, tipo, serie: data.serie, numero, fechaEmision: now.toISOString(), status: 'pendiente', hashCdr: digest,
      lastSentAt: now.toISOString(),
      clienteDoc: data.cliente.documento, clienteNombre: data.cliente.nombre, canal: 'sunat', rucEmisor: ruc, resumen,
      mensaje: 'En espera de la constancia de SUNAT.',
    }
    await writeConfig('invoices', [reserved, ...invoices], tx)
    return { invoice: reserved, nuevo: true }
  })
  if (invoice.canal === 'sunat' && invoice.status === 'pendiente' && invoice.rucEmisor !== ruc) {
    throw Object.assign(new Error('El envío pendiente corresponde a otro RUC. Revisa la configuración antes de reenviar.'), { status: 409 })
  }
  return invoice.canal === 'sunat' && invoice.status === 'pendiente' ? recibirSunat(orderId, config, nuevo) : invoice
}

let claveBeta: { privateKey: string; publicCert: string } | undefined

export function comprobantePrueba(tipo: EmitInput['tipo'], pedido?: PedidoBeta, emisorGuardado?: EmisorBeta) {
  const emisor = emisorGuardado
    ? { ...emisorGuardado, direccionFiscal: emisorGuardado.direccionFiscal?.trim() || 'DOMICILIO FISCAL PENDIENTE' }
    : { ruc: '20100066603', razonSocial: 'EMISOR DE PRUEBA', direccionFiscal: 'LIMA, PERÚ' }
  const cliente = tipo === 'factura'
    ? { tipDoc: '6', num: '20600000005', nombre: 'CLIENTE DE PRUEBA' }
    : { tipDoc: '0', num: '', nombre: '' }
  const detalle = pedido
    ? [{ descripcion: 'Consumo de prueba', cantidad: 1, precio: pedido.total }]
    : [{ descripcion: 'Consumo de prueba', cantidad: 2, precio: 10 }]
  const data = datosSunat(tipo, emisor, pedido?.total ?? 20, cliente, detalle, pedido?.tasa ?? 0.18)
  const document = { ...data, numero: pedido || emisorGuardado ? randomInt(10_000_000, 100_000_000) : 1, fecha: fechaLima() }
  if (!claveBeta) {
    const keys = forge.pki.rsa.generateKeyPair(2048)
    const certificate = forge.pki.createCertificate()
    certificate.publicKey = keys.publicKey
    certificate.serialNumber = '01'
    certificate.validity.notBefore = new Date(Date.now() - 60_000)
    certificate.validity.notAfter = new Date(Date.now() + 86_400_000)
    certificate.setSubject([{ name: 'commonName', value: 'SUNAT Beta Polleria' }])
    certificate.setIssuer(certificate.subject.attributes)
    certificate.sign(keys.privateKey, forge.md.sha256.create())
    claveBeta = { privateKey: forge.pki.privateKeyToPem(keys.privateKey), publicCert: forge.pki.certificateToPem(certificate) }
  }
  return { document, ...signedInvoice(document, claveBeta) }
}

export async function pedidoParaBeta(orderId: string): Promise<PedidoBeta> {
  if (!PEDIDO_ID.test(orderId)) throw Object.assign(new Error('Pedido inválido.'), { status: 400 })
  const pool = await getPool()
  const result = await pool.request().input('id', sql.UniqueIdentifier, orderId).query(`
    SELECT [Number], Paid, Status, Total FROM dbo.Orders WHERE Id = @id
  `)
  const order = result.recordset[0]
  if (!order?.Paid || /^(cancelad[oa]|eliminad[oa]|anulad[oa])$/i.test(order.Status) || !(Number(order.Total) > 0)) {
    throw Object.assign(new Error('Selecciona un pedido pagado y vigente para la prueba.'), { status: 400 })
  }
  return { numero: Number(order.Number), total: Number(order.Total), tasa: await loadIgvRate() }
}

export async function probarSunat(tipo: EmitInput['tipo'], pedido?: PedidoBeta, emisor?: EmisorBeta) {
  const { document, xml, digest } = comprobantePrueba(tipo, pedido, emisor)
  const nombre = [document.ruc, document.tipo, document.serie, document.numero].join('-')
  const pdf = await comprobantePdf(document, digest, { pedidoNumero: pedido?.numero })
  const prueba = {
    tipo, nombre, referencia: `${document.serie}-${document.numero}`, fecha: new Date().toISOString(),
    pedidoNumero: pedido?.numero, total: document.total,
    pdf: pdf.toString('base64'), xml: xml.toString('base64'),
  }
  try {
    const { code, message, zip } = await sendBill('beta', { ruc: document.ruc, usuario: 'MODDATOS', clave: 'moddatos' }, nombre, xml)
    return { ...prueba, codigo: code, mensaje: message, cdr: zip.toString('base64') }
  } catch (error) {
    return { ...prueba, codigo: null, mensaje: (error as Error).message }
  }
}

export async function reintentarSunat(orderId: string) {
  if (!PEDIDO_ID.test(orderId)) {
    throw Object.assign(new Error('Pedido inválido.'), { status: 400 })
  }
  const id = orderId.toLowerCase()
  const config = await readConfig<SunatConfig>('sunat')
  if (!config || !datosEmisorCompletos(config)) {
    throw Object.assign(new Error('Completa Configurar SUNAT para continuar el envío.'), { status: 400 })
  }
  return recibirSunat(id, config)
}

export async function emitirComprobante(input: EmitInput) {
  const orderId = String(input.orderId || '')
  if (!PEDIDO_ID.test(orderId)) {
    throw Object.assign(new Error('Pedido inválido'), { status: 400 })
  }
  const tipo = input.tipo === 'factura' ? 'factura' : 'boleta'
  const lines = (input.lines || []).filter((line) => line.descripcion.trim() && Number(line.cantidad) > 0)
  if (!lines.length) throw Object.assign(new Error('Agrega al menos un detalle'), { status: 400 })
  const cliente = input.cliente || { tipDoc: '0', num: '00000000', nombre: 'CLIENTES VARIOS' }
  if (tipo === 'factura' && (!/^\d{11}$/.test(cliente.num || '') || (cliente.nombre || '').trim().length < 2)) {
    throw Object.assign(new Error('La factura exige RUC y razón social'), { status: 400 })
  }
  const config = (await readConfig<SunatConfig>('sunat')) || {}
  return { invoice: await emitirDirecto(input, config, tipo, lines, cliente) }
}
