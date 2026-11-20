import { createHash, timingSafeEqual } from 'crypto'
import { getPool, sql } from '../db.js'
import { factilizaToken } from './factiliza.js'
import { saveComprobanteFile } from './comprobantes.js'
import { round2 } from './money.js'

/** SHA-256 de la clave de activación. La clave en claro no está en el código. */
const EMISION_KEY_SHA256 = 'e634ecdde274b2d72c43d43346242ced712d4e03edfdcb54e2e2b2d127eced18'

type SunatConfig = {
  ruc?: string
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
  status: 'aceptada' | 'rechazada'
  fechaEmision: string
  hashCdr?: string
  mensaje?: string
  clienteDoc?: string
  clienteNombre?: string
}

function claveValida(clave: string) {
  const got = createHash('sha256').update(clave.trim().toUpperCase()).digest()
  const want = Buffer.from(EMISION_KEY_SHA256, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

async function readConfig<T>(key: string): Promise<T | null> {
  const pool = await getPool()
  const r = await pool.request().input('key', sql.NVarChar, key).query(`SELECT ConfigValue FROM dbo.AppConfig WHERE ConfigKey=@key`)
  const raw = r.recordset[0]?.ConfigValue
  if (!raw) return null
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return null
  }
}

async function writeConfig(key: string, value: unknown) {
  const pool = await getPool()
  await pool
    .request()
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

export async function emisionActiva() {
  const data = await readConfig<{ activa?: boolean }>('emision_activa')
  return Boolean(data?.activa)
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
  const usados = invoices.filter((inv) => inv.serie === serie).map((inv) => Number(inv.numero) || 0)
  return (usados.length ? Math.max(...usados) : 0) + 1
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
  const invoices = (await readConfig<Invoice[]>('invoices')) || []
  const serie = (tipo === 'factura' ? config.seriefactura : config.serieboleta || 'B001') || (tipo === 'factura' ? 'F001' : 'B001')
  const numero = siguienteNumero(Array.isArray(invoices) ? invoices : [], serie)
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
  await writeConfig('invoices', [invoice, ...(Array.isArray(invoices) ? invoices : [])])
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
