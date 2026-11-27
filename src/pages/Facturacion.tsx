import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, Eye, EyeOff, Pencil, Plus, RefreshCw, Send, Settings2, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { useAuth } from '../auth/AuthContext'
import { formatDateTime, padOrder, round2, soles } from '../lib/format'
import type { Order } from '../types'
import { isRealtimeConnected, onRealtimeEvent, onRealtimeStatus } from '../lib/realtime'
import { combinarComprobante, ejecutarLoteSecuencial, normalizarPedidoId, pedidosSinComprobante } from '../lib/facturacionBatch'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'
import {
  apiComprobanteFiles,
  apiDownloadComprobante,
  apiDownloadComprobantes,
  apiEmitComprobante,
  apiEmisionEstado,
  apiGetClaveSol,
  apiGetInvoices,
  apiGetPruebasSunat,
  apiGetSunatConfig,
  apiLookupDoc,
  apiProbarSunat,
  apiReintentarComprobante,
  apiSaveSunatConfig,
  apiUploadCertificado,
  type Comprobante,
  type EstadoEmision,
  type PruebaSunat,
} from '../lib/apiClient'

interface SunatConfig {
  ruc: string
  razonSocial: string
  usuario: string
  clave: string
  direccionFiscal: string
  establecimiento: string
  serieboleta: string
  seriefactura: string
  certificadoCargado?: boolean
  certificadoNombre?: string
  claveSolGuardada?: boolean
}

const DEFAULT_SUNAT: SunatConfig = {
  ruc: '',
  razonSocial: '',
  usuario: '',
  clave: '',
  direccionFiscal: '',
  establecimiento: '0000',
  serieboleta: 'B001',
  seriefactura: 'F001',
}

const CLIENTE_GENERICO = { tipDoc: '0', num: '00000000', nombre: 'CLIENTES VARIOS' }
function configuracionGuardada(value: unknown): SunatConfig {
  if (!value || typeof value !== 'object') return DEFAULT_SUNAT
  const config = value as Partial<SunatConfig>
  return {
    ruc: config.ruc ?? '',
    razonSocial: config.razonSocial ?? '',
    usuario: config.usuario ?? '',
    clave: '',
    direccionFiscal: config.direccionFiscal ?? '',
    establecimiento: config.establecimiento || DEFAULT_SUNAT.establecimiento,
    serieboleta: config.serieboleta || DEFAULT_SUNAT.serieboleta,
    seriefactura: config.seriefactura || DEFAULT_SUNAT.seriefactura,
    certificadoCargado: config.certificadoCargado,
    certificadoNombre: config.certificadoNombre,
    claveSolGuardada: config.claveSolGuardada,
  }
}

type DetalleLine = { descripcion: string; cantidad: number; precio: number }

type TipoDocumentoCliente = 'ninguno' | 'dni' | 'ruc'
type DatosCliente = { tipo: TipoDocumentoCliente; numero: string; nombre: string }
type BorradorComprobante = { tipo: 'boleta' | 'factura'; cliente: DatosCliente; lines: DetalleLine[] }
type EstadoFila = { estado: 'en_cola' | 'emitiendo' | 'error'; mensaje?: string }
type ProgresoLote = { total: number; completados: number; emitidos: number; errores: number }
const DOCUMENTOS_CLIENTE: ReadonlyArray<{ tipo: TipoDocumentoCliente; etiqueta: string }> = [
  { tipo: 'ninguno', etiqueta: 'Sin documento' }, { tipo: 'dni', etiqueta: 'DNI' }, { tipo: 'ruc', etiqueta: 'RUC' },
]

function clienteInicial(order: Order, tipo: 'boleta' | 'factura'): DatosCliente {
  const numero = (order.docNumero || '').replace(/\D/g, '')
  const tieneRuc = numero.length === 11 && numero !== '00000000000'
  const nombre = order.docNombre?.trim() || ''
  if (tipo === 'factura' || tieneRuc) {
    return { tipo: 'ruc', numero: tieneRuc ? numero : '', nombre: tieneRuc || order.docTipo === 'factura' ? nombre : '' }
  }
  if (numero.length === 8 && numero !== CLIENTE_GENERICO.num) {
    return { tipo: 'dni', numero, nombre: nombre || order.customerName || '' }
  }
  if (order.total > 700 || order.docTipo === 'boleta_dni') return { tipo: 'dni', numero: '', nombre: nombre || order.customerName || '' }
  return { tipo: 'ninguno', numero: '', nombre: '' }
}

function errorDatosCliente(cliente: DatosCliente, tipo: 'boleta' | 'factura', total: number) {
  if (tipo === 'factura' && cliente.tipo !== 'ruc') return 'La factura requiere RUC y razón social.'
  if (cliente.tipo === 'ninguno') return total > 700 ? 'Selecciona DNI o RUC para este pedido.' : null
  const esRuc = cliente.tipo === 'ruc'
  if (!(esRuc ? /^\d{11}$/ : /^\d{8}$/).test(cliente.numero) || /^0+$/.test(cliente.numero)) return esRuc ? 'Ingresa un RUC de 11 dígitos.' : 'Ingresa un DNI de 8 dígitos.'
  if (cliente.nombre.trim().length < 2) return esRuc ? 'Ingresa la razón social.' : 'Ingresa el nombre del cliente.'
  return null
}

function clienteComprobante(cliente: DatosCliente) {
  if (cliente.tipo === 'ninguno') return CLIENTE_GENERICO
  return { tipDoc: cliente.tipo === 'ruc' ? '6' : '1', num: cliente.numero, nombre: cliente.nombre.trim() }
}

function detalleDe(order: Order): DetalleLine[] {
  const lines = order.items
    .filter((item) => item.qty > 0)
    .map((item) => ({ descripcion: item.name, cantidad: item.qty, precio: item.price }))
  if (!lines.length) return [{ descripcion: 'Consumo', cantidad: 1, precio: order.total }]
  const bruto = totalDetalle(lines)
  if (!order.discount || bruto <= 0 || round2(bruto - order.discount) !== order.total) return lines
  let remaining = order.total
  return lines.map((line, index) => {
    const importe = index === lines.length - 1
      ? remaining
      : Math.min(remaining, round2(line.cantidad * line.precio * order.total / bruto))
    remaining = round2(remaining - importe)
    return { ...line, precio: Number((importe / line.cantidad).toFixed(10)) }
  })
}

function totalDetalle(lines: DetalleLine[]) {
  return round2(lines.reduce((sum, line) => sum + round2(line.cantidad * line.precio), 0))
}

function borradorInicial(order: Order): BorradorComprobante {
  const tipo = order.docTipo === 'factura' ? 'factura' : 'boleta'
  return { tipo, cliente: clienteInicial(order, tipo), lines: detalleDe(order) }
}

function errorBorrador(order: Order, borrador: BorradorComprobante) {
  if (order.docTipo === 'factura' && borrador.tipo !== 'factura') return 'Este pedido requiere una factura.'
  const clienteError = errorDatosCliente(borrador.cliente, borrador.tipo, order.total)
  if (clienteError) return clienteError
  if (!borrador.lines.length) return 'Agrega al menos una línea al detalle.'
  if (borrador.lines.some((line) => !line.descripcion.trim() || !Number.isFinite(line.cantidad) ||
      line.cantidad <= 0 || line.cantidad !== Number(line.cantidad.toFixed(3)) ||
      !Number.isFinite(line.precio) || line.precio <= 0)) {
    return 'Cada línea necesita descripción, cantidad positiva de hasta tres decimales y precio positivo.'
  }
  if (totalDetalle(borrador.lines) !== round2(order.total)) return `El detalle debe sumar el importe pagado de ${soles(order.total)}.`
  return null
}

/** El precio de venta ya incluye IGV: a 10 se le resta, no se le suma. */
function separarIgv(total: number, rate: number) {
  const base = round2(total / (1 + (rate > 0 ? rate : 0.18)))
  return { base, igv: round2(total - base), total: round2(total) }
}

function DocumentoCliente({ cliente, tipo, total, disabled, error, onChange }: {
  cliente: DatosCliente
  tipo: 'boleta' | 'factura'
  total: number
  disabled: boolean
  error: string | null
  onChange: (cliente: DatosCliente) => void
}) {
  const id = useId()
  const solicitud = useRef<AbortController | null>(null)
  const [consultando, setConsultando] = useState(false)
  const [aviso, setAviso] = useState('')
  const esRuc = cliente.tipo === 'ruc'
  const longitud = esRuc ? 11 : 8
  const etiqueta = esRuc ? 'RUC' : 'DNI'

  useEffect(() => () => solicitud.current?.abort(), [])

  function actualizar(datos: DatosCliente) {
    solicitud.current?.abort()
    setConsultando(false)
    setAviso('')
    onChange(datos)
  }

  async function consultar() {
    if (cliente.tipo === 'ninguno' || cliente.numero.length !== longitud || consultando) return
    const controller = new AbortController()
    solicitud.current = controller
    setConsultando(true)
    setAviso('')
    try {
      const datos = await apiLookupDoc(cliente.tipo, cliente.numero, controller.signal)
      if (controller.signal.aborted) return
      const nombre = datos.nombre?.trim().slice(0, 100)
      if (nombre) onChange({ ...cliente, nombre })
      else setAviso('Ingresa el nombre o la razón social manualmente.')
    } catch {
      if (!controller.signal.aborted) setAviso('No se pudo consultar el documento. Puedes ingresar los datos manualmente.')
    } finally {
      if (!controller.signal.aborted) setConsultando(false)
    }
  }

  return (
    <fieldset disabled={disabled} aria-describedby={error ? `${id}-error` : undefined} className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-semibold">Cliente del comprobante</legend>
      {tipo === 'boleta' ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de documento del cliente">
          {DOCUMENTOS_CLIENTE.filter((doc) => doc.tipo !== 'ninguno' || total <= 700).map((doc) => (
            <button key={doc.tipo} type="button" aria-pressed={cliente.tipo === doc.tipo}
              onClick={() => { if (cliente.tipo !== doc.tipo) actualizar({ tipo: doc.tipo, numero: '', nombre: '' }) }}
              className={`min-h-11 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ember ${cliente.tipo === doc.tipo ? 'border-ember/55 bg-ember/10 text-ember' : 'border-ink/12 hover:bg-ink/8'}`}>
              {doc.etiqueta}
            </button>
          ))}
        </div>
      ) : null}
      {cliente.tipo !== 'ninguno' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={id} className="text-[11px] font-bold tracking-[0.14em] text-ink/60 uppercase">{etiqueta}</label>
            <div className="flex items-stretch gap-2">
              <input id={id} className={`${inputClass} min-w-0 flex-1`} inputMode="numeric" placeholder={`${longitud} dígitos`}
                value={cliente.numero} onChange={(event) => {
                  const numero = event.target.value.replace(/\D/g, '').slice(0, longitud)
                  if (numero !== cliente.numero) actualizar({ ...cliente, numero, nombre: cliente.numero.length === longitud ? '' : cliente.nombre })
                }} />
              <button type="button" disabled={cliente.numero.length !== longitud || consultando} onClick={() => void consultar()}
                className="min-h-11 shrink-0 rounded-lg border border-ink/15 px-3 text-xs font-semibold enabled:hover:bg-ink/8 focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-50">
                {consultando ? 'Consultando…' : 'Consultar'}
              </button>
            </div>
          </div>
          <Field label={esRuc ? 'Razón social' : 'Nombre del cliente'}>
            <input className={inputClass} maxLength={100} value={cliente.nombre}
              onChange={(event) => actualizar({ ...cliente, nombre: event.target.value })} />
          </Field>
        </div>
      ) : null}
      {error ? <p id={`${id}-error`} className="text-xs font-medium text-ink/75">{error}</p> : null}
      {aviso ? <p role="status" className="text-xs text-ink/75">{aviso}</p> : null}
    </fieldset>
  )
}

function EditorComprobante({ order, borrador, disabled, igvRate, onChange, onTipo, onClose }: {
  order: Order
  borrador: BorradorComprobante
  disabled: boolean
  igvRate: number
  onChange: (cambios: Partial<BorradorComprobante>) => void
  onTipo: (tipo: BorradorComprobante['tipo']) => void
  onClose: () => void
}) {
  const { tipo, cliente, lines } = borrador
  const dinero = separarIgv(totalDetalle(lines), igvRate)
  const actualizarLinea = (index: number, cambios: Partial<DetalleLine>) => {
    onChange({ lines: lines.map((line, i) => i === index ? { ...line, ...cambios } : line) })
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5 border-t border-ink/12 bg-cream/55 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label={`Tipo de comprobante de ${padOrder(order.number)}`}>
          {(['boleta', 'factura'] as const).map((opcion) => (
            <button key={opcion} type="button" aria-pressed={tipo === opcion}
              disabled={disabled || (opcion === 'boleta' && order.docTipo === 'factura')}
              onClick={() => onTipo(opcion)}
              className={`min-h-11 rounded-lg border px-3 text-sm font-semibold capitalize focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-50 ${tipo === opcion ? 'border-ember/55 bg-ember/10 text-ember' : 'border-ink/12 hover:bg-ink/8'}`}>
              {opcion}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 text-xs font-semibold text-ink/75 hover:bg-ink/8 focus-visible:outline-2 focus-visible:outline-ember">Cerrar edición</button>
      </div>
      <DocumentoCliente key={tipo} cliente={cliente} tipo={tipo} total={order.total} disabled={disabled}
        error={errorDatosCliente(cliente, tipo, order.total)} onChange={(datos) => onChange({ cliente: datos })} />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Detalle del comprobante</h3>
          <button type="button" onClick={() => onChange({ lines: [...lines, { descripcion: '', cantidad: 1, precio: 0 }] })}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ember hover:bg-ember/10 focus-visible:outline-2 focus-visible:outline-ember">
            <Plus size={14} aria-hidden /> Agregar línea
          </button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem_2.75rem] gap-2 text-xs font-medium text-ink/75 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_2.75rem]">
          <span>Descripción</span><span>Cant.</span><span>Precio</span><span className="sr-only">Acciones</span>
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem_2.75rem] gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_2.75rem]">
            <input className={`${inputClass} min-w-0`} value={line.descripcion} maxLength={500}
              aria-label={`Descripción de la línea ${index + 1} del pedido ${padOrder(order.number)}`}
              onChange={(event) => actualizarLinea(index, { descripcion: event.target.value })} />
            <input className={`${inputClass} min-w-0 px-2 tabular-nums`} type="number" inputMode="decimal" min="0.001" step="0.001" value={line.cantidad}
              aria-label={`Cantidad de la línea ${index + 1} del pedido ${padOrder(order.number)}`}
              onChange={(event) => actualizarLinea(index, { cantidad: Number(event.target.value) || 0 })} />
            <input className={`${inputClass} min-w-0 px-2 tabular-nums`} type="number" inputMode="decimal" min="0.01" step="any" value={line.precio}
              aria-label={`Precio de la línea ${index + 1} del pedido ${padOrder(order.number)}`}
              onChange={(event) => actualizarLinea(index, { precio: Number(event.target.value) || 0 })} />
            <button type="button" aria-label={`Quitar línea ${index + 1} del pedido ${padOrder(order.number)}`}
              onClick={() => onChange({ lines: lines.filter((_, i) => i !== index) })}
              className="flex min-h-11 items-center justify-center rounded-lg text-ink/70 hover:bg-ink/8 focus-visible:outline-2 focus-visible:outline-ember">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <p className="text-sm text-ink/80 tabular-nums">Total <strong>{soles(dinero.total)}</strong> · base {soles(dinero.base)} · IGV {soles(dinero.igv)}</p>
      {dinero.total !== round2(order.total) ? (
        <p role="status" className="text-sm text-amber-800 dark:text-amber-300">El detalle debe sumar el importe pagado de {soles(order.total)}.</p>
      ) : null}
    </fieldset>
  )
}

function CampoClaveSol({ clave, guardada, puedeVerGuardada, onChange }: {
  clave: string
  guardada: boolean
  puedeVerGuardada: boolean
  onChange: (clave: string) => void
}) {
  const id = useId()
  const solicitud = useRef<AbortController | null>(null)
  const [visible, setVisible] = useState(false)
  const [claveGuardada, setClaveGuardada] = useState<string | null>(null)
  const [consultando, setConsultando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const puedeMostrar = Boolean(clave) || (guardada && puedeVerGuardada)
  const mostrarGuardada = puedeVerGuardada && claveGuardada !== null
  const mostrar = visible && (Boolean(clave) || mostrarGuardada)

  useEffect(() => () => solicitud.current?.abort(), [])

  async function alternarVisibilidad() {
    setError(null)
    if (mostrar) {
      setVisible(false)
      setClaveGuardada(null)
      return
    }
    if (clave) {
      setVisible(true)
      return
    }
    if (!puedeMostrar || consultando) return

    const controller = new AbortController()
    solicitud.current = controller
    setConsultando(true)
    try {
      const response = await apiGetClaveSol(controller.signal)
      if (controller.signal.aborted) return
      setClaveGuardada(response.clave)
      setVisible(true)
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message)
    } finally {
      if (!controller.signal.aborted) setConsultando(false)
    }
  }

  const accion = consultando ? 'Consultando clave SOL' : mostrar ? 'Ocultar clave SOL' : 'Mostrar clave SOL'
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-[11px] font-bold tracking-[0.14em] text-ink/40 uppercase">Clave SOL</label>
      <div className="relative">
        <input id={id} className={`${inputClass} placeholder:text-ink/60 ${puedeMostrar ? 'pr-14' : ''}`}
          type={mostrar ? 'text' : 'password'} value={mostrarGuardada ? claveGuardada : clave} readOnly={consultando || mostrarGuardada}
          autoComplete="new-password" autoCapitalize="none" spellCheck={false}
          placeholder={guardada ? '••••••••' : undefined} aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            onChange(event.target.value)
            setError(null)
            if (!event.target.value) setVisible(false)
          }} />
        {puedeMostrar ? (
          <button type="button" aria-controls={id} aria-label={accion} title={accion} disabled={consultando}
            onClick={() => void alternarVisibilidad()}
            className="absolute inset-y-0 right-0.5 my-auto grid size-11 place-items-center rounded-xl text-ink/65 hover:bg-ink/8 hover:text-ink focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-60">
            {consultando ? <RefreshCw size={17} className="motion-safe:animate-spin" aria-hidden /> : mostrar ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
        ) : null}
      </div>
      {error ? <p id={`${id}-error`} role="status" className="text-xs text-ink/80">{error}</p> : null}
    </div>
  )
}

function ArchivosPruebaSunat({ prueba }: { prueba: PruebaSunat }) {
  const archivos = [
    { label: 'PDF', nombre: `beta-${prueba.nombre}.pdf`, mime: 'application/pdf', datos: prueba.pdf },
    { label: 'XML', nombre: `beta-${prueba.nombre}.xml`, mime: 'application/xml', datos: prueba.xml },
    { label: 'CDR', nombre: `beta-R-${prueba.nombre}.zip`, mime: 'application/zip', datos: prueba.cdr },
  ]
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold"><span className="capitalize">{prueba.tipo}</span> {prueba.referencia}</p>
        <p className="text-xs break-words text-ink/75">
          {prueba.pedidoNumero ? `${padOrder(prueba.pedidoNumero)} · ${soles(prueba.total ?? 0)} · ` : ''}
          {formatDateTime(prueba.fecha)} · {prueba.codigo === '0' ? 'Aceptada en Beta' : prueba.codigo ? `Código ${prueba.codigo}` : 'Sin constancia de Beta'}
        </p>
        {prueba.mensaje ? <p className="mt-1 text-xs break-words text-ink/75">{prueba.mensaje}</p> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {archivos.map(({ label, nombre, mime, datos }) => datos ? (
          <a key={label} href={`data:${mime};base64,${datos}`} download={nombre}
            aria-label={`Descargar ${label} de ${prueba.tipo} Beta`}
            className="inline-flex min-h-11 items-center rounded-lg border border-ink/15 px-3 text-xs font-semibold hover:bg-ink/8 focus-visible:outline-2 focus-visible:outline-gold">
            {label}
          </a>
        ) : null)}
      </div>
    </li>
  )
}

export function Facturacion() {
  const { state } = useStore()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [config, setConfig] = useState<SunatConfig>(DEFAULT_SUNAT)
  const [savedConfig, setSavedConfig] = useState<SunatConfig>(DEFAULT_SUNAT)
  const [invoices, setInvoices] = useState<Comprobante[]>([])
  const [configOpen, setConfigOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [borradores, setBorradores] = useState<Record<string, BorradorComprobante>>({})
  const [edicionesAbiertas, setEdicionesAbiertas] = useState<string[]>([])
  const [estadosFila, setEstadosFila] = useState<Record<string, EstadoFila>>({})
  const [progresoLote, setProgresoLote] = useState<ProgresoLote | null>(null)
  const [sending, setSending] = useState(false)
  const loteEnCurso = useRef(false)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [configResult, setConfigResult] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testing, setTesting] = useState<'boleta' | 'factura' | null>(null)
  const [betaDisponible, setBetaDisponible] = useState(false)
  const [pruebas, setPruebas] = useState<Partial<Record<PruebaSunat['tipo'], PruebaSunat>>>({})
  const [retrying, setRetrying] = useState<string | null>(null)
  const [descargandoArchivos, setDescargandoArchivos] = useState<string | null>(null)
  const descargaEnCurso = useRef(false)
  const [files, setFiles] = useState<Record<string, { pdf: boolean; xml: boolean; cdr: boolean }>>({})
  const [vista, setVista] = useState<'pendientes' | 'emitidos'>('pendientes')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'boleta' | 'factura'>('todos')
  const [soloAceptadas, setSoloAceptadas] = useState(false)
  const [buscarEmitido, setBuscarEmitido] = useState('')
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certClave, setCertClave] = useState('')
  const [certMsg, setCertMsg] = useState<string | null>(null)
  const [certSending, setCertSending] = useState(false)
  const [reemplazarCertificado, setReemplazarCertificado] = useState(false)
  const [emision, setEmision] = useState<EstadoEmision | null>(null)
  const [consultandoEmision, setConsultandoEmision] = useState(true)
  const [errorEmision, setErrorEmision] = useState(false)
  const consultaEmisionId = useRef(0)
  const cambiosComprobantes = useRef(new Map<string, Comprobante>())
  const refrescarComprobantes = useRef<() => void>(() => {})
  const compatible = typeof emision?.configurada === 'boolean' && emision.requiereLicencia === false
  const disponible = !consultandoEmision && compatible && emision?.disponible === true

  const actualizarComprobante = useCallback((invoice: Comprobante) => {
    const id = normalizarPedidoId(invoice.orderId)
    const actual = cambiosComprobantes.current.get(id)
    const [ultimo] = combinarComprobante(actual ? [actual] : [], invoice)
    cambiosComprobantes.current.set(id, ultimo)
    setInvoices((prev) => combinarComprobante(prev, ultimo))
  }, [])

  useEffect(() => {
    let activo = true
    let actualizando = false
    let repetir = false

    const refrescar = async () => {
      if (!activo) return
      if (actualizando) {
        repetir = true
        return
      }
      actualizando = true
      cambiosComprobantes.current.clear()
      try {
        const [comprobantes, archivos] = await Promise.allSettled([apiGetInvoices(), apiComprobanteFiles()])
        if (!activo) return
        if (comprobantes.status === 'fulfilled') {
          const recientes = [...cambiosComprobantes.current.values()]
          setInvoices(recientes.reduce(combinarComprobante, comprobantes.value.invoices || []))
        }
        if (archivos.status === 'fulfilled') {
          setFiles(Object.fromEntries(Object.entries(archivos.value.files || {}).map(([id, available]) => [normalizarPedidoId(id), available])))
        }
      } finally {
        actualizando = false
        if (repetir && activo) {
          repetir = false
          void refrescar()
        }
      }
    }
    refrescarComprobantes.current = () => { void refrescar() }
    const offEvent = onRealtimeEvent((event, payload) => {
      if (event !== 'invoice:updated' || !payload || typeof payload !== 'object') return
      const invoice = payload as Comprobante
      if (typeof invoice.orderId !== 'string' || typeof invoice.serie !== 'string' ||
          !Number.isInteger(invoice.numero) || !['boleta', 'factura'].includes(invoice.tipo) ||
          !['pendiente', 'enviada', 'aceptada', 'rechazada'].includes(invoice.status)) return
      actualizarComprobante(invoice)
      if (invoice.status === 'aceptada' || invoice.status === 'rechazada') {
        setLastResult(`${invoice.serie}-${invoice.numero} · ${invoice.status}${invoice.mensaje ? ' · ' + invoice.mensaje : ''}`)
      }
      void refrescar()
    })
    const offStatus = onRealtimeStatus((conectado) => { if (conectado) void refrescar() })
    if (!isRealtimeConnected()) void refrescar()
    const alVolver = () => {
      if (document.visibilityState === 'visible') void refrescar()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refrescar()
    }, 15_000)
    return () => {
      activo = false
      refrescarComprobantes.current = () => {}
      offEvent()
      offStatus()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [actualizarComprobante])

  const consultarEmision = useCallback(async () => {
    const solicitud = ++consultaEmisionId.current
    setConsultandoEmision(true)
    setErrorEmision(false)
    try {
      const resultado = await apiEmisionEstado()
      if (solicitud === consultaEmisionId.current) setEmision(resultado)
    } catch {
      if (solicitud === consultaEmisionId.current) {
        setEmision(null)
        setErrorEmision(true)
      }
    } finally {
      if (solicitud === consultaEmisionId.current) setConsultandoEmision(false)
    }
  }, [])

  useEffect(() => {
    if (admin) void apiGetSunatConfig()
      .then((r) => setSavedConfig(configuracionGuardada(r.config)))
      .catch(() => undefined)
    if (admin) void apiGetPruebasSunat()
      .then(({ pruebas }) => {
        setPruebas((prev) => ({ ...Object.fromEntries(pruebas.map((prueba) => [prueba.tipo, prueba])), ...prev }))
        setBetaDisponible(true)
      })
      .catch(() => undefined)
    void consultarEmision()
    return () => { consultaEmisionId.current += 1 }
  }, [admin, consultarEmision])

  const pendingOrders = pedidosSinComprobante(state.orders, invoices)
  const selectedOrders = pendingOrders.filter((o) => picked.includes(normalizarPedidoId(o.id)))
  const emitidos = [...invoices].reverse().filter((inv) => {
    if (filtroTipo !== 'todos' && inv.tipo !== filtroTipo) return false
    if (soloAceptadas && inv.status !== 'aceptada') return false
    const order = state.orders.find((o) => normalizarPedidoId(o.id) === normalizarPedidoId(inv.orderId))
    const texto = `${inv.tipo} ${inv.serie} ${inv.numero} ${inv.status} ${order?.number || ''} ${order?.customerName || ''} ${inv.clienteDoc || ''} ${inv.clienteNombre || ''}`.toLowerCase()
    return !buscarEmitido.trim() || texto.includes(buscarEmitido.trim().toLowerCase())
  })
  const verEmitidos = (tipo: 'todos' | 'boleta' | 'factura', aceptadas = false) => {
    setVista('emitidos')
    setFiltroTipo(tipo)
    setSoloAceptadas(aceptadas)
  }

  const abrirConfig = () => {
    setConfig({ ...savedConfig, clave: '' })
    setConfigResult(null)
    setCertFile(null)
    setCertClave('')
    setCertMsg(null)
    setReemplazarCertificado(false)
    setConfigOpen(true)
    void consultarEmision()
  }

  const handleSaveConfig = async () => {
    if (!compatible || !admin) return
    setSavingConfig(true)
    setConfigResult(null)
    try {
      const response = await apiSaveSunatConfig(config)
      setSavedConfig(configuracionGuardada(response.config))
      consultaEmisionId.current += 1
      setConsultandoEmision(false)
      setErrorEmision(false)
      setEmision(response.estado)
      setConfigOpen(false)
      setLastResult(response.estado.disponible ? 'Configuración guardada. Emisión habilitada.' : `Configuración guardada. ${response.estado.motivo || 'Completa los datos SUNAT y el certificado para emitir.'}`)
    } catch (e) {
      setConfigResult((e as Error).message)
    } finally {
      setSavingConfig(false)
    }
  }

  const probar = async (tipo: 'boleta' | 'factura', orderId?: string) => {
    setTesting(tipo)
    setConfigResult(null)
    if (orderId) setLastResult(null)
    try {
      const test = await apiProbarSunat(tipo, orderId)
      setPruebas((prev) => ({ ...prev, [tipo]: test }))
    } catch (e) {
      if (orderId) setLastResult((e as Error).message)
      else setConfigResult((e as Error).message)
    } finally {
      setTesting(null)
    }
  }

  const subirCertificado = async () => {
    if (!certFile) {
      setCertMsg('Selecciona el archivo .pfx o .p12')
      return
    }
    if (certClave.trim().length < 8) {
      setCertMsg('La clave del certificado tiene al menos 8 caracteres')
      return
    }
    setCertSending(true)
    setCertMsg(null)
    try {
      const info = await apiUploadCertificado(certFile, certClave.trim())
      setConfig((prev) => ({
        ...prev,
        certificadoCargado: info.cargado,
        certificadoNombre: info.nombre,
      }))
      setSavedConfig((prev) => ({ ...prev, certificadoCargado: info.cargado, certificadoNombre: info.nombre }))
      void consultarEmision()
      setCertFile(null)
      setCertClave('')
      setReemplazarCertificado(false)
      setCertMsg(`Certificado guardado: ${info.nombre}`)
    } catch (e) {
      setCertMsg((e as Error).message)
    } finally {
      setCertSending(false)
    }
  }

  const igvRate = state.settings.igvRate > 0 ? state.settings.igvRate : 0.18

  const borradorDe = (order: Order) => borradores[normalizarPedidoId(order.id)] ?? borradorInicial(order)

  const editarPedido = (order: Order, cambios: Partial<BorradorComprobante>) => {
    const id = normalizarPedidoId(order.id)
    setBorradores((prev) => ({ ...prev, [id]: { ...(prev[id] ?? borradorInicial(order)), ...cambios } }))
    setEstadosFila((prev) => {
      const siguientes = { ...prev }
      delete siguientes[id]
      return siguientes
    })
  }

  const cambiarTipo = (order: Order, tipo: BorradorComprobante['tipo']) => {
    if (order.docTipo === 'factura' && tipo !== 'factura') return
    const borrador = borradorDe(order)
    editarPedido(order, {
      tipo,
      cliente: tipo === 'factura' && borrador.cliente.tipo !== 'ruc'
        ? clienteInicial(order, tipo) : borrador.cliente,
    })
  }

  const emitirPedidos = async (orders: Order[]) => {
    if (loteEnCurso.current || !disponible || !orders.length) return
    loteEnCurso.current = true
    const pendientes = pedidosSinComprobante(orders, invoices)
    const unicos = [...new Map(pendientes.map((order) => [normalizarPedidoId(order.id), order])).values()]
    const lote = unicos.map((order) => ({ order, borrador: borradorDe(order) }))
    let completados = 0
    let emitidosLote = 0
    let errores = 0
    setSending(true)
    setLastResult(null)
    setProgresoLote({ total: lote.length, completados: 0, emitidos: 0, errores: 0 })
    setEstadosFila((prev) => ({ ...prev, ...Object.fromEntries(lote.map(({ order }) => [normalizarPedidoId(order.id), { estado: 'en_cola' as const }])) }))
    try {
      await ejecutarLoteSecuencial(lote, async ({ order, borrador }) => {
        const id = normalizarPedidoId(order.id)
        setEstadosFila((prev) => ({ ...prev, [id]: { estado: 'emitiendo' } }))
        try {
          const error = errorBorrador(order, borrador)
          if (error) throw new Error(error)
          const { invoice } = await apiEmitComprobante({
            orderId: id,
            tipo: borrador.tipo,
            cliente: clienteComprobante(borrador.cliente),
            lines: borrador.lines.map((line) => ({ ...line, descripcion: line.descripcion.trim() })),
          })
          actualizarComprobante(invoice)
          setPicked((prev) => prev.filter((pickedId) => pickedId !== id))
          setEdicionesAbiertas((prev) => prev.filter((abierto) => abierto !== id))
          if (invoice.status === 'rechazada') {
            errores += 1
            setLastResult(`${padOrder(order.number)} · ${invoice.serie}-${invoice.numero} rechazada: ${invoice.mensaje || 'Revisa el resultado en Comprobantes.'}`)
          } else emitidosLote += 1
        } finally {
          completados += 1
          setProgresoLote({ total: lote.length, completados, emitidos: emitidosLote, errores })
        }
      }, ({ order }, error) => {
        const id = normalizarPedidoId(order.id)
        errores += 1
        const mensaje = error instanceof Error ? error.message : 'No se pudo emitir. Revisa los datos e inténtalo nuevamente.'
        setEstadosFila((prev) => ({ ...prev, [id]: { estado: 'error', mensaje } }))
        setEdicionesAbiertas((prev) => prev.includes(id) ? prev : [...prev, id])
        setProgresoLote({ total: lote.length, completados, emitidos: emitidosLote, errores })
      })
    } finally {
      loteEnCurso.current = false
      setSending(false)
      refrescarComprobantes.current()
      void apiEmisionEstado().then(setEmision).catch(() => undefined)
    }
  }

  const reintentar = async ({ orderId, tipo }: Comprobante) => {
    if (retrying !== null) return
    setRetrying(orderId)
    setLastResult(null)
    const signal = AbortSignal.timeout(tipo === 'boleta' ? 35_000 : 75_000)
    try {
      const { invoice } = await apiReintentarComprobante(orderId, signal)
      actualizarComprobante(invoice)
      setLastResult(`${invoice.serie}-${invoice.numero} · ${invoice.status}${invoice.mensaje ? ' · ' + invoice.mensaje : ''}`)
      refrescarComprobantes.current()
    } catch (e) {
      setLastResult(signal.aborted ? 'El servidor tardó en responder. Vuelve a consultar el estado del comprobante.' : (e as Error).message)
    } finally {
      setRetrying(null)
    }
  }

  const tieneArchivosDescargables = (invoice: Comprobante) => {
    const disponibles = files[normalizarPedidoId(invoice.orderId)]
    return Boolean(disponibles?.xml || disponibles?.cdr ||
      (disponibles?.pdf && (invoice.canal !== 'sunat' || invoice.status === 'aceptada')))
  }
  const comprobantesDescargables = emitidos.filter(tieneArchivosDescargables)

  const descargarArchivos = async (orderIds: string[], destino: string) => {
    if (descargaEnCurso.current || !orderIds.length) return
    descargaEnCurso.current = true
    setDescargandoArchivos(destino)
    setLastResult(null)
    try {
      await apiDownloadComprobantes(orderIds)
    } catch (error) {
      setLastResult((error as Error).message || 'No se pudieron descargar los archivos. Vuelve a intentarlo.')
    } finally {
      descargaEnCurso.current = false
      setDescargandoArchivos(null)
    }
  }

  const statusIcon = (s: Comprobante['status']) => {
    if (s === 'aceptada') return <CheckCircle2 size={14} className="text-green-600" />
    if (s === 'rechazada') return <AlertCircle size={14} className="text-red-600" />
    return <RefreshCw size={14} className="text-amber-600" />
  }

  const estado = consultandoEmision ? 'Consultando emisión…'
    : errorEmision ? 'No se pudo consultar'
      : !compatible ? 'API pendiente de actualizar'
        : disponible ? 'Emisión activa' : 'Configuración pendiente'
  const detalleEstado = consultandoEmision ? 'Consultando el estado de facturación en el servidor.'
    : errorEmision ? 'No se pudo consultar la facturación. Vuelve a comprobar el estado; si el problema continúa, revisa la conexión con el servidor.'
      : !compatible ? 'La API de facturación del servidor aún debe actualizarse. Sube la API compilada y reinicia su servicio para habilitar esta versión. Conserva el certificado y la configuración guardados.'
        : emision?.motivo || 'La emisión se habilita al completar los datos SUNAT y cargar un certificado válido.'
  const porcentajeLote = progresoLote?.total
    ? Math.min(100, Math.round(progresoLote.completados / progresoLote.total * 100)) : 0
  const metrics = [
    { label: 'Por facturar', value: pendingOrders.length, action: () => setVista('pendientes'), selected: vista === 'pendientes' },
    { label: 'Boletas', value: invoices.filter((i) => i.tipo === 'boleta').length, action: () => verEmitidos('boleta'), selected: vista === 'emitidos' && filtroTipo === 'boleta' },
    { label: 'Facturas', value: invoices.filter((i) => i.tipo === 'factura').length, action: () => verEmitidos('factura'), selected: vista === 'emitidos' && filtroTipo === 'factura' },
    { label: 'Aceptados por SUNAT', value: invoices.filter((i) => i.status === 'aceptada').length, action: () => verEmitidos('todos', true), selected: vista === 'emitidos' && soloAceptadas },
  ]

  return (
    <section className="mx-auto max-w-[96rem] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <PageTitle title="Facturación electrónica" />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-ink/70">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${disponible ? 'bg-ember/10 text-ember' : 'bg-amber-500/12 text-amber-800 dark:text-amber-300'}`}>
              {disponible ? <CheckCircle2 size={14} aria-hidden /> : <AlertCircle size={14} aria-hidden />}
              {estado}
            </span>
            {admin && savedConfig.ruc ? (
              <>
                <span>SUNAT directo</span>
                <span className="tabular-nums">RUC {savedConfig.ruc}</span>
              </>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={abrirConfig}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink/15 bg-surface px-4 text-sm font-semibold transition-colors hover:bg-ink/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
        >
          <Settings2 size={16} aria-hidden /> Configurar SUNAT
        </button>
      </header>

      {lastResult ? <p role="status" className="rounded-xl border border-ink/12 bg-surface px-4 py-3 text-sm text-ink/85">{lastResult}</p> : null}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink/12 bg-ink/12 sm:grid-cols-4">
        {metrics.map(({ label, value, action, selected }) => (
          <button
            key={label}
            type="button"
            aria-pressed={selected}
            onClick={action}
            className="group min-w-0 bg-surface px-3 py-3 text-left transition-colors hover:bg-cream-dark focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ember sm:px-4"
          >
            <span className={`block text-xl font-extrabold tracking-tight tabular-nums ${selected ? 'text-ember' : 'text-ink'}`}>{value}</span>
            <span className="mt-0.5 block text-xs font-semibold leading-snug text-ink/70">{label}</span>
          </button>
        ))}
      </div>

      <nav aria-label="Vistas de facturación" className="flex flex-wrap gap-x-5 border-b border-ink/12">
        <button
          type="button"
          aria-pressed={vista === 'pendientes'}
          onClick={() => setVista('pendientes')}
          className={`min-h-11 border-b-2 px-1 text-sm font-semibold ${vista === 'pendientes' ? 'border-ember text-ember' : 'border-transparent text-ink/70 hover:text-ink'}`}
        >
          Pedidos por facturar
        </button>
        <button
          type="button"
          aria-pressed={vista === 'emitidos'}
          onClick={() => verEmitidos('todos')}
          className={`min-h-11 border-b-2 px-1 text-sm font-semibold ${vista === 'emitidos' ? 'border-ember text-ember' : 'border-transparent text-ink/70 hover:text-ink'}`}
        >
          Comprobantes
        </button>
      </nav>

      {vista === 'pendientes' ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink/85">Pedidos pagados sin comprobante</h2>
              <p className="mt-1 text-xs text-ink/75">Selecciona los pedidos y emítelos juntos. Edita una fila solo si necesitas cambiar sus datos.</p>
            </div>
            <button
              type="button"
              disabled={!selectedOrders.length || sending || !disponible}
              onClick={() => void emitirPedidos(selectedOrders)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ember px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember disabled:opacity-50"
            >
              {sending ? <RefreshCw size={15} aria-hidden className="motion-safe:animate-spin" /> : <Send size={15} aria-hidden />}
              {sending && progresoLote ? `Emitiendo ${Math.min(progresoLote.completados + 1, progresoLote.total)} de ${progresoLote.total}…` : `Emitir seleccionados (${selectedOrders.length})`}
            </button>
          </div>
          {!disponible ? <p role="status" className="mt-3 text-sm text-ink/80">{detalleEstado}</p> : null}
          {progresoLote ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-end justify-between gap-3 text-sm tabular-nums">
                <p role="status" aria-live="polite" className="text-ink/85">
                  {sending ? 'Emitiendo comprobantes' : 'Emisión finalizada'}
                  <span className="mt-0.5 block text-xs text-ink/75 sm:ml-2 sm:mt-0 sm:inline">
                    {progresoLote.completados} de {progresoLote.total} procesados
                  </span>
                </p>
                <span aria-hidden="true" className="shrink-0 font-bold text-ember">{porcentajeLote}%</span>
              </div>
              <div role="progressbar" aria-label="Progreso de emisión" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={porcentajeLote}
                aria-valuetext={`${porcentajeLote}%, ${progresoLote.completados} de ${progresoLote.total} procesados`}
                className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                <div className="h-full rounded-full bg-ember motion-safe:transition-[width] motion-safe:duration-300"
                  style={{ width: `${porcentajeLote}%` }} />
              </div>
              <p className="text-xs text-ink/75">
                {progresoLote.emitidos} emitidos
                {progresoLote.errores ? ` · ${progresoLote.errores} con error; revisa las filas marcadas o Comprobantes.`
                  : !sending ? ' · El estado SUNAT se actualizará automáticamente en Comprobantes.' : ''}
              </p>
            </div>
          ) : null}
          {pendingOrders.length === 0 ? (
            <p className="card mt-3 p-4 text-sm text-ink/60">No hay pedidos pagados sin comprobante.</p>
          ) : (
            <div className="mt-3 divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/12 bg-surface">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 xl:grid-cols-[minmax(12rem,1.2fr)_5rem_minmax(10rem,1fr)_6rem_10rem] sm:px-4">
                <label className="inline-flex min-h-11 items-center gap-3 text-xs font-semibold text-ink/80">
                  <input type="checkbox" className="h-4 w-4 shrink-0 rounded" disabled={sending}
                    checked={selectedOrders.length === pendingOrders.length}
                    ref={(node) => { if (node) node.indeterminate = selectedOrders.length > 0 && selectedOrders.length < pendingOrders.length }}
                    onChange={(event) => setPicked(event.target.checked ? pendingOrders.map((order) => normalizarPedidoId(order.id)) : [])} />
                  Seleccionar todos
                </label>
                <span className="hidden text-xs font-semibold text-ink/75 xl:block">Tipo</span>
                <span className="hidden text-xs font-semibold text-ink/75 xl:block">Cliente del comprobante</span>
                <span className="hidden text-right text-xs font-semibold text-ink/75 xl:block">Total</span>
                <span className="text-right text-xs font-medium text-ink/75">{selectedOrders.length} seleccionados</span>
              </div>
              {pendingOrders.map((o) => {
                const id = normalizarPedidoId(o.id)
                const borrador = borradorDe(o)
                const abierta = edicionesAbiertas.includes(id)
                const estadoFila = estadosFila[id]
                const resumenCliente = borrador.cliente.tipo === 'ninguno' ? 'CLIENTES VARIOS' : borrador.cliente.nombre || (borrador.cliente.tipo === 'ruc' ? 'Completa la razón social' : 'Completa el nombre')
                return (
                  <div key={id}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 xl:grid-cols-[minmax(12rem,1.2fr)_5rem_minmax(10rem,1fr)_6rem_10rem] sm:px-4">
                      <label className="flex min-w-0 items-center gap-3">
                        <input type="checkbox" className="h-4 w-4 shrink-0 rounded" disabled={sending}
                          checked={picked.includes(id)} aria-label={`Seleccionar pedido ${padOrder(o.number)}`}
                          onChange={(event) => setPicked((prev) => event.target.checked ? [...new Set([...prev, id])] : prev.filter((pickedId) => pickedId !== id))} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{padOrder(o.number)} · {o.customerName}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-ink/75">{formatDateTime(o.createdAt)} · {o.paymentMethod}</span>
                        </span>
                      </label>
                      <span className="text-right text-sm font-medium capitalize text-ink/85 xl:text-left">{borrador.tipo}</span>
                      <div className="min-w-0 pl-7 xl:pl-0">
                        <p className="truncate text-xs font-medium text-ink/85" title={resumenCliente}>{resumenCliente}</p>
                        {borrador.cliente.tipo !== 'ninguno' ? <p className="mt-0.5 text-xs text-ink/75">{borrador.cliente.tipo.toUpperCase()} {borrador.cliente.numero || 'pendiente'}</p> : null}
                      </div>
                      <span className="whitespace-nowrap text-right text-sm font-bold tabular-nums">{soles(o.total)}</span>
                      <div className="col-span-2 flex flex-wrap items-center justify-end gap-1 xl:col-span-1">
                        {estadoFila?.estado === 'en_cola' ? <span role="status" className="mr-2 text-xs text-ink/75">En cola</span> : null}
                        <button type="button" disabled={sending} aria-expanded={abierta} aria-controls={`editar-${id}`}
                          onClick={() => setEdicionesAbiertas((prev) => abierta ? prev.filter((abierto) => abierto !== id) : [...prev, id])}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-ink/80 hover:bg-ink/8 focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-50">
                          <Pencil size={13} aria-hidden /> {abierta ? 'Cerrar' : 'Editar'}
                        </button>
                        <button type="button" disabled={sending || !disponible} onClick={() => void emitirPedidos([o])}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink/15 px-3 text-xs font-semibold text-ember hover:bg-ember/10 focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-50">
                          {estadoFila?.estado === 'emitiendo' ? <RefreshCw size={13} aria-hidden className="motion-safe:animate-spin" /> : <Send size={13} aria-hidden />}
                          {estadoFila?.estado === 'emitiendo' ? 'Emitiendo…' : 'Emitir'}
                        </button>
                      </div>
                      {estadoFila?.estado === 'error' ? (
                        <p role="alert" className="col-span-2 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300 xl:col-span-5">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {estadoFila.mensaje}
                        </p>
                      ) : null}
                    </div>
                    {abierta ? (
                      <div id={`editar-${id}`}>
                        <EditorComprobante order={o} borrador={borrador} disabled={sending} igvRate={igvRate}
                          onChange={(cambios) => editarPedido(o, cambios)} onTipo={(tipo) => cambiarTipo(o, tipo)}
                          onClose={() => setEdicionesAbiertas((prev) => prev.filter((abierto) => abierto !== id))} />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-ink/75">{soloAceptadas ? 'Aceptados por SUNAT' : 'Comprobantes registrados'} ({emitidos.length})</h2>
              <button type="button" disabled={descargandoArchivos !== null || !comprobantesDescargables.length}
                title="Descargar los archivos disponibles de los comprobantes mostrados"
                onClick={() => void descargarArchivos(comprobantesDescargables.map((invoice) => invoice.orderId), 'todos')}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 text-xs font-semibold text-ember hover:bg-ember/10 focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-50">
                {descargandoArchivos === 'todos' ? <RefreshCw size={15} aria-hidden className="motion-safe:animate-spin" /> : <Download size={15} aria-hidden />}
                {descargandoArchivos === 'todos' ? 'Descargando…' : `Descargar todos (${comprobantesDescargables.length})`}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className={`${inputClass} w-52`}
                value={buscarEmitido}
                aria-label="Buscar comprobantes"
                placeholder="Buscar serie, pedido o cliente"
                onChange={(e) => setBuscarEmitido(e.target.value)}
              />
              <button type="button" onClick={() => verEmitidos('todos')} className={`min-h-10 rounded-xl px-3 text-xs font-bold ${filtroTipo === 'todos' && !soloAceptadas ? 'bg-ink text-cream' : 'bg-cream'}`}>Todos</button>
              <button type="button" onClick={() => verEmitidos('boleta')} className={`min-h-10 rounded-xl px-3 text-xs font-bold ${filtroTipo === 'boleta' ? 'bg-ink text-cream' : 'bg-cream'}`}>Boletas</button>
              <button type="button" onClick={() => verEmitidos('factura')} className={`min-h-10 rounded-xl px-3 text-xs font-bold ${filtroTipo === 'factura' ? 'bg-ink text-cream' : 'bg-cream'}`}>Facturas</button>
            </div>
          </div>
          {emitidos.length === 0 ? (
            <p className="card mt-3 p-4 text-sm text-ink/60">
              {invoices.length ? 'No hay comprobantes para este filtro.' : 'Los comprobantes aparecerán aquí con su estado y archivos.'}
            </p>
          ) : (
            <div className="mt-3 divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/12 bg-surface">
              {emitidos.map((inv) => {
                const order = state.orders.find((o) => normalizarPedidoId(o.id) === normalizarPedidoId(inv.orderId))
                const prueba = order && pruebas[inv.tipo]?.pedidoNumero === order.number ? pruebas[inv.tipo] : undefined
                const motivo = inv.mensaje?.trim() === 'Failed to fetch'
                  ? 'El envío anterior falló por un error de conexión.'
                  : inv.mensaje?.replace(/https?:\/\/\S+|\bfactiliza\b/gi, 'servicio anterior')
                const esperaSunat = inv.status === 'pendiente' && Boolean(inv.resumen?.ticket)
                return (
                  <div key={`${inv.orderId}-${inv.serie}-${inv.numero}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize">
                        {inv.tipo} {inv.serie}-{String(inv.numero).padStart(8, '0')}
                      </p>
                      <p className="text-xs text-ink/50">
                        {order ? `${padOrder(order.number)} · ${order.customerName} · ${soles(order.total)}` : inv.clienteNombre || 'Pedido'}
                        {' · '}{formatDateTime(inv.fechaEmision)}
                      </p>
                      {motivo ? (
                        <p className="mt-1 max-w-2xl text-xs text-ink/70">{motivo}</p>
                      ) : null}
                      {inv.status === 'rechazada' && !files[normalizarPedidoId(inv.orderId)]?.cdr ? (
                        <p className="mt-1 text-xs text-ink/70">Constancia de rechazo no disponible.</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex items-center gap-1 text-xs ${esperaSunat ? '' : 'capitalize'}`}>
                        {statusIcon(inv.status)} {esperaSunat ? 'Pendiente en SUNAT' : inv.status}
                      </span>
                      {inv.canal === 'sunat' && inv.status === 'pendiente' ? (
                        <button type="button" disabled={!emision?.configurada || retrying !== null} onClick={() => void reintentar(inv)}
                          className="min-h-10 rounded-lg border border-ink/12 px-2.5 text-xs font-semibold text-ember hover:bg-ember/10 disabled:opacity-50">
                          {esperaSunat ? (retrying === inv.orderId ? 'Consultando…' : 'Consultar estado')
                            : (retrying === inv.orderId ? 'Reintentando…' : 'Reintentar envío')}
                        </button>
                      ) : null}
                      {admin && betaDisponible && order?.paid && inv.status === 'rechazada' ? (
                        <button type="button" disabled={testing !== null} onClick={() => void probar(inv.tipo, order.id)}
                          className="min-h-10 rounded-lg border border-ink/12 px-2.5 text-xs font-semibold hover:bg-ink/8 disabled:opacity-50">
                          {testing === inv.tipo ? 'Validando en Beta…' : prueba ? 'Volver a probar en Beta' : 'Generar evidencia Beta'}
                        </button>
                      ) : null}
                      <button type="button" disabled={descargandoArchivos !== null || !tieneArchivosDescargables(inv)}
                        aria-label={`Descargar todos los archivos de ${inv.tipo} ${inv.serie}-${String(inv.numero).padStart(8, '0')}`}
                        title="Descargar PDF, XML y CDR disponibles"
                        onClick={() => void descargarArchivos([inv.orderId], normalizarPedidoId(inv.orderId))}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 text-xs font-semibold text-ember hover:bg-ember/10 focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-50">
                        {descargandoArchivos === normalizarPedidoId(inv.orderId)
                          ? <RefreshCw size={13} aria-hidden className="motion-safe:animate-spin" /> : <Download size={13} aria-hidden />}
                        {descargandoArchivos === normalizarPedidoId(inv.orderId) ? 'Descargando…' : 'Descargar todo'}
                      </button>
                      {(['pdf', 'xml', 'cdr'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          disabled={!files[normalizarPedidoId(inv.orderId)]?.[kind] || (inv.canal === 'sunat' && inv.status !== 'aceptada' && kind === 'pdf')}
                          className="text-xs font-bold uppercase text-ember disabled:text-ink/30"
                          onClick={() => void apiDownloadComprobante(inv.orderId, kind).catch((e) => setLastResult((e as Error).message))}
                        >
                          {kind}
                        </button>
                      ))}
                    </div>
                    {prueba ? (
                      <ul aria-label="Evidencia SUNAT Beta" aria-live="polite" className="w-full rounded-lg border border-ink/12">
                        <ArchivosPruebaSunat prueba={prueba} />
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <Modal open={configOpen} title="Configurar SUNAT" onClose={() => setConfigOpen(false)} closeDisabled={savingConfig || certSending || testing !== null} wide>
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void handleSaveConfig() }}>
          <section aria-labelledby="estado-facturacion" className="rounded-xl border border-ink/12 bg-cream px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <h3 id="estado-facturacion" className="text-sm font-bold">Emisión automática</h3>
              <span className={`text-xs font-semibold ${disponible ? 'text-ember' : 'text-ink/70'}`}>
                {estado}
              </span>
            </div>
            <p role="status" aria-live="polite" className="mt-2 text-sm leading-relaxed text-ink/80">{detalleEstado}</p>
            {!disponible ? (
              <button type="button" disabled={consultandoEmision} onClick={() => void consultarEmision()}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-semibold hover:bg-ink/8 disabled:opacity-50">
                <RefreshCw size={14} aria-hidden className={consultandoEmision ? 'motion-safe:animate-spin' : undefined} />
                {consultandoEmision ? 'Consultando…' : 'Volver a comprobar'}
              </button>
            ) : null}
          </section>

          {admin ? (
            <>
              <section aria-labelledby="datos-emisor" className="space-y-3">
                <h3 id="datos-emisor" className="text-sm font-bold">Datos del emisor</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="RUC">                  <input className={inputClass} value={config.ruc} inputMode="numeric" maxLength={11} onChange={(e) => setConfig({ ...config, ruc: e.target.value })} placeholder="20XXXXXXXXX" />
                  </Field>
                  <Field label="Razón social">
                    <input className={inputClass} value={config.razonSocial} onChange={(e) => setConfig({ ...config, razonSocial: e.target.value })} />
                  </Field>
                  <Field label="Serie de boleta">
                    <input className={inputClass} value={config.serieboleta} onChange={(e) => setConfig({ ...config, serieboleta: e.target.value })} placeholder="B001" />
                  </Field>
                  <Field label="Serie de factura">
                    <input className={inputClass} value={config.seriefactura} onChange={(e) => setConfig({ ...config, seriefactura: e.target.value })} placeholder="F001" />
                  </Field>
                </div>
              </section>

              <section aria-labelledby="acceso-sol" className="space-y-3 border-t border-ink/12 pt-4">
                <h3 id="acceso-sol" className="text-sm font-bold">Acceso SUNAT</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Usuario SOL secundario">
                    <input className={inputClass} value={config.usuario} autoComplete="off" onChange={(e) => setConfig({ ...config, usuario: e.target.value })} />
                  </Field>
                  <CampoClaveSol key={user?.id} clave={config.clave} guardada={Boolean(config.claveSolGuardada)}
                    puedeVerGuardada={user?.isSystem === true}
                    onChange={(clave) => setConfig((prev) => ({ ...prev, clave }))} />
                  <Field label="Dirección fiscal">
                    <input className={inputClass} value={config.direccionFiscal} onChange={(e) => setConfig({ ...config, direccionFiscal: e.target.value })} />
                  </Field>
                  <Field label="Código de establecimiento">
                    <input className={inputClass} value={config.establecimiento} inputMode="numeric" maxLength={4}
                      onChange={(e) => setConfig({ ...config, establecimiento: e.target.value })} placeholder="0000" />
                  </Field>
                </div>
              </section>

              <section aria-labelledby="certificado-sunat" className="space-y-3 border-t border-ink/12 pt-4">
                <h3 id="certificado-sunat" className="text-sm font-bold">Certificado digital</h3>
                {config.certificadoCargado ? (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={16} aria-hidden /> Certificado guardado en el servidor</p>
                      <p className="mt-1 break-all text-sm text-ink/85">{config.certificadoNombre || 'Certificado digital'}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink/75">El sistema utilizará este archivo. No necesitas volver a seleccionarlo ni ingresar su contraseña.</p>
                    </div>
                    {!reemplazarCertificado ? (
                      <button type="button" onClick={() => { setReemplazarCertificado(true); setCertMsg(null) }}
                        className="min-h-11 rounded-lg border border-ink/15 px-3 text-sm font-semibold hover:bg-ink/8">Cambiar certificado</button>
                    ) : null}
                  </div>
                ) : <p className="text-sm text-ink/75">Carga el archivo .p12 o .pfx y su contraseña para guardarlo en el servidor.</p>}
                {!config.certificadoCargado || reemplazarCertificado ? (
                  <>
                    <div className="grid items-end gap-3 sm:grid-cols-2">
                      <Field label={config.certificadoCargado ? 'Nuevo archivo del certificado' : 'Archivo del certificado'}>
                        <input type="file" accept=".pfx,.p12,application/x-pkcs12" disabled={certSending}
                          className="block min-h-12 w-full min-w-0 rounded-xl border border-ink/12 p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-ink/8 file:px-2 file:py-1.5"
                          onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
                      </Field>
                      <Field label={config.certificadoCargado ? 'Contraseña del nuevo certificado' : 'Contraseña del certificado'}>
                        <input className={inputClass} type="password" value={certClave} disabled={certSending} autoComplete="new-password" onChange={(e) => setCertClave(e.target.value)} />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={certSending || !certFile} onClick={() => void subirCertificado()}
                        className="min-h-11 rounded-lg border border-ink/15 px-4 text-sm font-semibold hover:bg-ink/8 disabled:opacity-50">
                        {certSending ? 'Guardando…' : config.certificadoCargado ? 'Reemplazar certificado' : 'Guardar certificado'}
                      </button>
                      {config.certificadoCargado ? (
                        <button type="button" disabled={certSending} onClick={() => { setReemplazarCertificado(false); setCertFile(null); setCertClave(''); setCertMsg(null) }}
                          className="min-h-11 rounded-lg px-3 text-sm font-semibold hover:bg-ink/8 disabled:opacity-50">Conservar certificado actual</button>
                      ) : null}
                    </div>
                  </>
                ) : null}
                {certMsg ? <p role="status" className="text-xs text-ink/80">{certMsg}</p> : null}
              </section>

              <section aria-labelledby="pruebas-sunat" className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/12 pt-4">
                <div>
                  <h3 id="pruebas-sunat" className="text-sm font-bold">Validación en SUNAT Beta</h3>
                  <p className="mt-1 text-xs text-ink/70">Comprobantes ficticios sin validez tributaria.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['factura', 'boleta'] as const).map((tipo) => (
                    <button key={tipo} type="button" disabled={!betaDisponible || testing !== null} onClick={() => void probar(tipo)}
                      className="min-h-11 rounded-xl border border-ink/15 px-3 text-xs font-semibold hover:bg-ink/8 disabled:opacity-50">
                      {testing === tipo ? 'Validando…' : `Probar ${tipo}`}
                    </button>
                  ))}
                </div>
                {Object.values(pruebas).some(Boolean) ? (
                  <ul aria-label="Resultados de SUNAT Beta" aria-live="polite" className="w-full divide-y divide-ink/12 rounded-xl border border-ink/12">
                    {(['factura', 'boleta'] as const).map((tipo) => pruebas[tipo] ? <ArchivosPruebaSunat key={tipo} prueba={pruebas[tipo]} /> : null)}
                  </ul>
                ) : null}
              </section>
            </>
          ) : null}

          {configResult ? <p role="status" className="rounded-xl border border-ink/12 bg-cream px-3 py-2.5 text-sm text-ink/85">{configResult}</p> : null}
          {admin ? (
            <div className="flex justify-end border-t border-ink/12 pt-4">
              <button type="submit" disabled={savingConfig || !compatible || Boolean(certFile)}
                className="min-h-11 rounded-xl bg-ember px-4 text-sm font-semibold text-white disabled:opacity-50 dark:text-cream">
                {savingConfig ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </div>
          ) : null}
        </form>
      </Modal>
    </section>
  )
}
