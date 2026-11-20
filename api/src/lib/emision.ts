import { createHash, timingSafeEqual } from 'crypto'
import fs from 'node:fs/promises'
import forge from 'node-forge'
import { getPool, sql } from '../db.js'
import { factilizaToken } from './factiliza.js'
import { certificadoInfo, leerCertificado } from './certificado.js'
import { comprobanteFilePath, saveComprobanteFile } from './comprobantes.js'
import { loadIgvRate, round2 } from './money.js'
import { parseCdr, pkcs12SigningKeys, sendBill, signedInvoice, type SunatDocument } from './sunat.js'
import { comprobantePdf } from './sunatPdf.js'

/** SHA-256 de la clave de activación. La clave en claro no está en el código. */
const EMISION_KEY_SHA256 = 'e634ecdde274b2d72c43d43346242ced712d4e03edfdcb54e2e2b2d127eced18'

type SunatConfig = {
  ruc?: string
  razonSocial?: string
  direccionFiscal?: string
  establecimiento?: string
  usuario?: string
  clave?: string
  proveedor?: 'sunat' | 'factiliza'
  ambiente?: 'beta' | 'produccion'
  serieboleta?: string
  seriefactura?: string
  apiUrl?: string
  enabled?: boolean
}

type EmitLine = { descripcion: string; cantidad: number; precio: number }

export type EmitInput = {
  orderId: string
  tipo: 'boleta' | 'factura'
  email?: string
  incluyeIgv?: boolean
  igvRate?: number
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
}

function claveValida(clave: string) {
  const got = createHash('sha256').update(clave.trim().toUpperCase()).digest()
  const want = Buffer.from(EMISION_KEY_SHA256, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
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

export async function guardarComprobantes(incoming: Invoice[]) {
  await withInvoiceLock(async (tx) => {
    const directos = (await readInvoices(tx)).filter((invoice) => invoice?.canal === 'sunat')
    const ids = new Set(directos.map((invoice) => invoice.orderId))
    const legacy = incoming.filter((invoice) => invoice && invoice.canal !== 'sunat' && !ids.has(invoice.orderId))
    await writeConfig('invoices', [...directos, ...legacy], tx)
  })
}

export async function emisionActiva() {
  const data = await readConfig<{ activa?: boolean }>('emision_activa')
  return Boolean(data?.activa)
}

export async function estadoEmision() {
  const [activa, config] = await Promise.all([emisionActiva(), readConfig<SunatConfig>('sunat')])
  const directa = config?.proveedor === 'sunat'
  if (!directa) return { activa, directa, disponible: activa }
  const datosCompletos = Boolean(config.usuario && config.clave && config.direccionFiscal && config.ruc && config.razonSocial)
  const certificado = await certificadoInfo()
  const disponible = activa && config.enabled === true && config.ambiente === 'produccion' && datosCompletos && certificado.cargado && certificado.tieneClave
  return { activa, directa, disponible }
}

/** La primera clave correcta activa para siempre. Una clave distinta no cambia nada. */
export async function activarEmision(clave: string) {
  if (await emisionActiva()) return { activa: true }
  if (!claveValida(clave)) {
    const err = new Error('La clave no es correcta')
    ;(err as Error & { status?: number }).status = 400
    throw err
  }
  await writeConfig('emision_activa', { activa: true, activadaAt: new Date().toISOString() })
  return { activa: true }
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

function invoiceBase(config: SunatConfig) {
  const url = String(config.apiUrl || '').trim().replace(/\/$/, '')
  if (/factiliza\.com\/api\/v1/i.test(url)) return url.replace(/\/invoice\/.*$/, '')
  return config.ambiente === 'beta' ? 'https://apife-qa.factiliza.com/api/v1' : 'https://api.factiliza.com/api/v1'
}

function siguienteNumero(invoices: Invoice[], serie: string) {
  const usados = invoices.filter((inv) => inv?.serie?.toUpperCase() === serie.toUpperCase()).map((inv) => Number(inv.numero) || 0)
  return (usados.length ? Math.max(...usados) : 0) + 1
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

async function recibirSunat(orderId: string, config: SunatConfig) {
  return withInvoiceLock(async (tx) => {
    const invoices = await readInvoices(tx)
    const invoice = invoices.find((item) => item?.orderId === orderId)
    if (!invoice?.rucEmisor || invoice.canal !== 'sunat') throw new Error('No se encontró el comprobante reservado.')
    if (invoice.status !== 'pendiente') return invoice
    if (invoice.rucEmisor !== String(config.ruc || '').trim()) {
      throw Object.assign(new Error('El comprobante pendiente corresponde a otro RUC.'), { status: 409 })
    }
    const nombre = nombreSunat(invoice)
    const xml = await fs.readFile(comprobanteFilePath(orderId, 'xml'))
    const auth = credencialesSunat(config, invoice.rucEmisor)
    // Si la base de datos falló después de recibir el CDR, recupera la constancia antes de reenviar.
    let cdr = await fs.readFile(comprobanteFilePath(orderId, 'cdr'))
      .then((zip) => parseCdr(zip, nombre))
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
        return null
      })
    if (!cdr) {
      try {
        cdr = await sendBill('produccion', auth, nombre, xml)
      } catch (error) {
        invoice.mensaje = (error as Error).message || 'SUNAT aún no confirmó el envío.'
        await writeConfig('invoices', invoices, tx)
        return invoice
      }
      await saveComprobanteFile(orderId, 'cdr', cdr.zip)
    }
    invoice.status = Number(cdr.code) === 0 ? 'aceptada' : 'rechazada'
    invoice.mensaje = cdr.message || `SUNAT ${cdr.code}`
    await writeConfig('invoices', invoices, tx)
    return invoice
  })
}

async function emitirDirecto(input: EmitInput, config: SunatConfig, tipo: EmitInput['tipo'], lines: EmitLine[], cliente: EmitInput['cliente']) {
  if (config.ambiente !== 'produccion' || config.enabled !== true) {
    throw Object.assign(new Error('Habilita la emisión directa en Producción desde Configurar SUNAT.'), { status: 400 })
  }
  const orderId = input.orderId.toLowerCase()
  const ruc = String(config.ruc || '').trim()
  credencialesSunat(config, ruc)

  const invoice = await withInvoiceLock(async (tx) => {
    const invoices = await readInvoices(tx)
    const existing = invoices.find((item) => item?.orderId?.toLowerCase() === orderId)
    if (existing) return existing
    const result = await new sql.Request(tx).input('id', sql.UniqueIdentifier, orderId).query(`
      SELECT Paid, Status, Total FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE Id = @id
    `)
    const order = result.recordset[0]
    if (!order?.Paid || /^(cancelad[oa]|eliminad[oa]|anulad[oa])$/i.test(order.Status) || !(Number(order.Total) > 0)) {
      throw Object.assign(new Error('El comprobante requiere un pedido pagado y vigente.'), { status: 400 })
    }
    const data = datosSunat(tipo, config, Number(order.Total), cliente, lines, await loadIgvRate(tx))
    const numero = siguienteNumero(invoices, data.serie)
    if (!Number.isSafeInteger(numero) || numero < 1 || numero > 99_999_999) throw new Error('El correlativo SUNAT queda fuera de rango.')
    const now = new Date()
    const document = { ...data, numero, fecha: fechaLima(now) }
    const { archivo, clave } = await leerCertificado()
    const { xml, digest } = signedInvoice(document, pkcs12SigningKeys(archivo, clave))
    const pdf = await comprobantePdf(document, digest)
    await saveComprobanteFile(orderId, 'xml', xml)
    await saveComprobanteFile(orderId, 'pdf', pdf)
    const reserved: Invoice = {
      orderId, tipo, serie: data.serie, numero, fechaEmision: now.toISOString(), status: 'pendiente', hashCdr: digest,
      clienteDoc: data.cliente.documento, clienteNombre: data.cliente.nombre, canal: 'sunat', rucEmisor: ruc,
      mensaje: 'En espera de la constancia de SUNAT.',
    }
    await writeConfig('invoices', [reserved, ...invoices], tx)
    return reserved
  })
  if (invoice.canal === 'sunat' && invoice.status === 'pendiente' && invoice.rucEmisor !== ruc) {
    throw Object.assign(new Error('El envío pendiente corresponde a otro RUC. Revisa la configuración antes de reenviar.'), { status: 409 })
  }
  return invoice.canal === 'sunat' && invoice.status === 'pendiente' ? recibirSunat(orderId, config) : invoice
}

let claveBeta: { privateKey: string; publicCert: string } | undefined

export function comprobantePrueba(tipo: EmitInput['tipo']) {
  const emisor = { ruc: '20100066603', razonSocial: 'EMISOR DE PRUEBA', direccionFiscal: 'LIMA, PERÚ' }
  const cliente = tipo === 'factura'
    ? { tipDoc: '6', num: '20600000005', nombre: 'CLIENTE DE PRUEBA' }
    : { tipDoc: '0', num: '', nombre: '' }
  const detalle = [{ descripcion: 'Consumo de prueba', cantidad: 2, precio: 10 }]
  const data = datosSunat(tipo, emisor, 20, cliente, detalle, 0.18)
  const document = { ...data, numero: 1, fecha: fechaLima() }
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

export async function probarSunat(tipo: EmitInput['tipo']) {
  const { document, xml } = comprobantePrueba(tipo)
  const nombre = [document.ruc, document.tipo, document.serie, document.numero].join('-')
  const { code, message } = await sendBill('beta', { ruc: document.ruc, usuario: 'MODDATOS', clave: 'moddatos' }, nombre, xml)
  return { codigo: code, mensaje: message }
}

export async function reintentarSunat(orderId: string) {
  const [activa, config] = await Promise.all([emisionActiva(), readConfig<SunatConfig>('sunat')])
  if (!activa || config?.proveedor !== 'sunat' || config.ambiente !== 'produccion' || config.enabled !== true) {
    throw Object.assign(new Error('Activa y habilita SUNAT directo en Producción para continuar el envío.'), { status: 400 })
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    throw Object.assign(new Error('Pedido inválido.'), { status: 400 })
  }
  return recibirSunat(orderId.toLowerCase(), config)
}

export async function emitirComprobante(input: EmitInput) {
  if (!(await emisionActiva())) {
    const err = new Error('La emisión no está activada')
    ;(err as Error & { status?: number }).status = 403
    throw err
  }
  const orderId = String(input.orderId || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
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
  const ruc = String(config.ruc || '').replace(/\D/g, '')
  if (ruc.length !== 11) throw Object.assign(new Error('Falta el RUC del emisor en la configuración'), { status: 400 })
  if (config.proveedor === 'sunat') return { invoice: await emitirDirecto(input, config, tipo, lines, cliente) }
  return withInvoiceLock((tx) => emitirFactiliza(tx, input, config, orderId, tipo, lines, cliente, ruc))
}

async function emitirFactiliza(
  tx: sql.Transaction,
  input: EmitInput,
  config: SunatConfig,
  orderId: string,
  tipo: EmitInput['tipo'],
  lines: EmitLine[],
  cliente: EmitInput['cliente'],
  ruc: string,
) {
  const invoices = await readInvoices(tx)
  const directo = invoices.find((item) => item?.canal === 'sunat' && item.orderId.toLowerCase() === orderId.toLowerCase())
  if (directo) {
    if (directo.status !== 'pendiente') return { invoice: directo }
    throw Object.assign(new Error('Ya hay un comprobante SUNAT pendiente para este pedido.'), { status: 409 })
  }
  const token = await factilizaToken()
  if (!token) throw Object.assign(new Error('Falta el token de Factiliza'), { status: 400 })

  const rate = input.igvRate && input.igvRate > 0 ? input.igvRate : 0.18
  const pct = round2(rate * 100)
  const detalle = lines.map((line, index) => {
    const cantidad = Number(line.cantidad)
    const precio = round2(Number(line.precio))
    const bruto = round2(cantidad * precio)
    const base = round2(bruto / (1 + rate))
    const igv = round2(bruto - base)
    const valorUnit = round2(base / cantidad)
    return {
      unidad: 'NIU',
      cantidad,
      cod_Producto: `P${index + 1}`,
      descripcion: line.descripcion.trim().slice(0, 500),
      monto_Valor_Unitario: valorUnit,
      monto_Base_Igv: base,
      porcentaje_Igv: pct,
      igv,
      tip_Afe_Igv: '10',
      total_Impuestos: igv,
      monto_Precio_Unitario: precio,
      monto_Valor_Venta: base,
      factor_Icbper: 0,
    }
  })
  const gravada = round2(detalle.reduce((sum, line) => sum + line.monto_Base_Igv, 0))
  const igv = round2(detalle.reduce((sum, line) => sum + line.igv, 0))
  const total = round2(gravada + igv)
  const serie = (tipo === 'factura' ? config.seriefactura : config.serieboleta || 'B001') || (tipo === 'factura' ? 'F001' : 'B001')
  const numero = siguienteNumero(invoices, serie)
  const fecha = fechaLima()
  const payload = {
    tipo_Operacion: '0101',
    tipo_Doc: tipo === 'factura' ? '01' : '03',
    serie,
    correlativo: String(numero),
    tipo_Moneda: 'PEN',
    fecha_Emision: fecha,
    empresa_Ruc: ruc,
    cliente_Tipo_Doc: tipo === 'factura' ? '6' : '0',
    cliente_Num_Doc: tipo === 'factura' ? cliente.num : '00000000',
    cliente_Razon_Social: tipo === 'factura' ? cliente.nombre.trim() : 'CLIENTES VARIOS',
    cliente_Direccion: (cliente.direccion || '-').trim() || '-',
    monto_Oper_Gravadas: gravada,
    monto_Oper_Exoneradas: 0,
    monto_Igv: igv,
    total_Impuestos: igv,
    valor_Venta: gravada,
    sub_Total: total,
    monto_Imp_Venta: total,
    estado_Documento: '0',
    manual: false,
    id_Base_Dato: orderId,
    detalle,
    forma_pago: [{ tipo: 'Contado', monto: total, cuota: 0, fecha_Pago: fecha }],
    legend: [{ legend_Code: '1000', legend_Value: solesEnLetras(total) }],
  }

  const base = invoiceBase(config)
  const res = await fetch(`${base}/invoice/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  })
  const body = (await res.json().catch(() => null)) as {
    success?: boolean
    message?: string
    data?: { hash?: string; sunatResponse?: { success?: boolean; cdrZip?: string; cdrResponse?: { code?: string; description?: string } } }
  } | null
  if (!res.ok || body?.success === false) {
    throw Object.assign(new Error(body?.message || `Factiliza respondió ${res.status}`), { status: 502 })
  }
  const code = String(body?.data?.sunatResponse?.cdrResponse?.code ?? '')
  const aceptada = body?.data?.sunatResponse?.success !== false && (code === '' || code === '0')
  const invoice: Invoice = {
    orderId,
    tipo,
    serie,
    numero,
    status: aceptada ? 'aceptada' : 'rechazada',
    fechaEmision: new Date().toISOString(),
    hashCdr: body?.data?.hash,
    mensaje: body?.data?.sunatResponse?.cdrResponse?.description || body?.message,
    clienteDoc: payload.cliente_Num_Doc,
    clienteNombre: payload.cliente_Razon_Social,
  }
  await writeConfig('invoices', [invoice, ...invoices], tx)
  const zip = body?.data?.sunatResponse?.cdrZip
  if (zip) {
    try {
      await saveComprobanteFile(orderId, 'cdr', Buffer.from(zip, 'base64'))
    } catch {
      /* el CDR igual se puede volver a pedir */
    }
  }
  const fileBody = { empresa_Ruc: ruc, tipo_Doc: payload.tipo_Doc, serie, correlativo: String(numero) }
  for (const kind of ['pdf', 'xml', 'cdr'] as const) {
    try {
      const fileRes = await fetch(`${base}/invoice/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: '*/*', 'Content-Type': 'application/json' },
        body: JSON.stringify(fileBody),
        signal: AbortSignal.timeout(60000),
      })
      if (!fileRes.ok) continue
      const buf = Buffer.from(await fileRes.arrayBuffer())
      const contentType = fileRes.headers.get('content-type') || ''
      if (contentType.includes('json')) {
        const json = JSON.parse(buf.toString()) as { data?: string }
        if (typeof json.data === 'string' && json.data) await saveComprobanteFile(orderId, kind, Buffer.from(json.data, 'base64'))
      } else if (buf.length) {
        await saveComprobanteFile(orderId, kind, buf)
      }
    } catch {
      /* la lista igual muestra el comprobante y el archivo se reintenta al descargar */
    }
  }
  return { invoice }
}
