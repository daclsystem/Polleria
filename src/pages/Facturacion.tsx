import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, Key, Plus, RefreshCw, Send, Settings2, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { useAuth } from '../auth/AuthContext'
import { formatDateTime, padOrder, round2, soles } from '../lib/format'
import { isVoidOrder, type Order } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'
import {
  apiActivarEmision,
  apiComprobanteFiles,
  apiDownloadComprobante,
  apiEmitComprobante,
  apiEmisionEstado,
  apiGetInvoices,
  apiGetSunatConfig,
  apiProbarSunat,
  apiReintentarComprobante,
  apiSaveSunatConfig,
  apiUploadCertificado,
} from '../lib/apiClient'

interface SunatConfig {
  ruc: string
  razonSocial: string
  usuario: string
  clave: string
  proveedor: 'factiliza' | 'sunat'
  direccionFiscal: string
  establecimiento: string
  ambiente: 'beta' | 'produccion'
  serieboleta: string
  seriefactura: string
  apiUrl: string
  factilizaToken: string
  enabled: boolean
  certificadoCargado?: boolean
  certificadoNombre?: string
  certificadoClave?: boolean
  claveSolGuardada?: boolean
  factilizaTokenGuardado?: boolean
}

const DEFAULT_SUNAT: SunatConfig = {
  ruc: '',
  razonSocial: '',
  usuario: '',
  clave: '',
  proveedor: 'factiliza',
  direccionFiscal: '',
  establecimiento: '0000',
  ambiente: 'beta',
  serieboleta: 'B001',
  seriefactura: 'F001',
  apiUrl: 'https://api.factiliza.com/v1',
  factilizaToken: '',
  enabled: false,
}

type InvoiceStatus = 'pendiente' | 'enviada' | 'aceptada' | 'rechazada'

interface Invoice {
  orderId: string
  tipo: 'boleta' | 'factura'
  serie: string
  numero: number
  status: InvoiceStatus
  fechaEmision: string
  hashCdr?: string
  mensaje?: string
  clienteDoc?: string
  clienteNombre?: string
  canal?: 'sunat'
}

const CLIENTE_GENERICO = { tipDoc: '0', num: '00000000', nombre: 'CLIENTES VARIOS' }
const CORREO_LOCAL = 'comprobante@chifapollerialopez.com'

type DetalleLine = { descripcion: string; cantidad: number; precio: number }

function clienteComprobante(order: Order, tipo: 'boleta' | 'factura', directa = false) {
  if (tipo === 'factura') {
    const num = (order.docNumero || '').replace(/\D/g, '')
    const nombre = (order.docNombre || '').trim()
    return {
      tipDoc: '6',
      num,
      nombre,
      email: order.docEmail,
      ok: num.length === 11 && nombre.length >= 2,
    }
  }
  if (directa && order.docTipo === 'boleta_dni') {
    const num = (order.docNumero || '').replace(/\D/g, '')
    const nombre = (order.docNombre || order.customerName || '').trim()
    return { tipDoc: '1', num, nombre, email: order.docEmail, ok: num.length === 8 && nombre.length >= 2 }
  }
  return { ...CLIENTE_GENERICO, email: order.docEmail, ok: !directa || order.total <= 700 }
}

function detalleDe(order: Order, directa: boolean): DetalleLine[] {
  const lines = order.items
    .filter((item) => item.qty > 0)
    .map((item) => ({ descripcion: item.name, cantidad: item.qty, precio: item.price }))
  if (!lines.length) return [{ descripcion: 'Consumo', cantidad: 1, precio: order.total }]
  const bruto = totalDetalle(lines)
  if (!directa || !order.discount || bruto <= 0 || round2(bruto - order.discount) !== order.total) return lines
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
  return round2(lines.reduce((sum, line) => sum + line.cantidad * line.precio, 0))
}

/** El precio de venta ya incluye IGV: a 10 se le resta, no se le suma. */
function separarIgv(total: number, rate: number) {
  const base = round2(total / (1 + (rate > 0 ? rate : 0.18)))
  return { base, igv: round2(total - base), total: round2(total) }
}

export function Facturacion() {
  const { state } = useStore()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [config, setConfig] = useState<SunatConfig>(DEFAULT_SUNAT)
  const [savedConfig, setSavedConfig] = useState<SunatConfig>(DEFAULT_SUNAT)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [configOpen, setConfigOpen] = useState(false)
  const [emitOpen, setEmitOpen] = useState(false)
  const [queue, setQueue] = useState<Order[]>([])
  const [queueAt, setQueueAt] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const [emitType, setEmitType] = useState<'boleta' | 'factura'>('boleta')
  const [incluyeIgv, setIncluyeIgv] = useState(false)
  const [email, setEmail] = useState('')
  const [lines, setLines] = useState<DetalleLine[]>([])
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [configResult, setConfigResult] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testing, setTesting] = useState<'boleta' | 'factura' | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<string, { pdf: boolean; xml: boolean; cdr: boolean }>>({})
  const [vista, setVista] = useState<'pendientes' | 'emitidos'>('pendientes')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'boleta' | 'factura'>('todos')
  const [soloAceptadas, setSoloAceptadas] = useState(false)
  const [buscarEmitido, setBuscarEmitido] = useState('')
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certClave, setCertClave] = useState('')
  const [certMsg, setCertMsg] = useState<string | null>(null)
  const [certSending, setCertSending] = useState(false)
  const [emisionActiva, setEmisionActiva] = useState<boolean | null>(null)
  const [disponible, setDisponible] = useState(false)
  const [directa, setDirecta] = useState(false)
  const [canalDirectoDisponible, setCanalDirectoDisponible] = useState(false)
  const [clave, setClave] = useState('')
  const [claveError, setClaveError] = useState<string | null>(null)
  const [activando, setActivando] = useState(false)

  useEffect(() => {
    if (admin) void apiGetSunatConfig()
      .then((r) => {
        if (r.config && typeof r.config === 'object') setSavedConfig({ ...DEFAULT_SUNAT, ...(r.config as SunatConfig), clave: '', factilizaToken: '' })
      })
      .catch(() => undefined)
    void apiGetInvoices()
      .then((r) => setInvoices((r.invoices as Invoice[]) || []))
      .catch(() => undefined)
    void apiComprobanteFiles()
      .then((r) => setFiles(r.files || {}))
      .catch(() => undefined)
    void apiEmisionEstado()
      .then((r) => {
        setEmisionActiva(Boolean(r.activa))
        setDirecta(Boolean(r.directa))
        setCanalDirectoDisponible(typeof r.directa === 'boolean')
        setDisponible(r.disponible ?? Boolean(r.activa))
      })
      .catch(() => setEmisionActiva(null))
  }, [admin])

  const paidOrders = state.orders.filter((o) => o.paid && !isVoidOrder(o.status))
  const invoicedIds = new Set(invoices.map((i) => i.orderId))
  const pendingOrders = paidOrders.filter((o) => !invoicedIds.has(o.id))
  const emitidos = [...invoices].reverse().filter((inv) => {
    if (filtroTipo !== 'todos' && inv.tipo !== filtroTipo) return false
    if (soloAceptadas && inv.status !== 'aceptada') return false
    const order = state.orders.find((o) => o.id === inv.orderId)
    const texto = `${inv.tipo} ${inv.serie} ${inv.numero} ${inv.status} ${order?.number || ''} ${order?.customerName || ''} ${inv.clienteDoc || ''} ${inv.clienteNombre || ''}`.toLowerCase()
    return !buscarEmitido.trim() || texto.includes(buscarEmitido.trim().toLowerCase())
  })
  const verEmitidos = (tipo: 'todos' | 'boleta' | 'factura', aceptadas = false) => {
    setVista('emitidos')
    setFiltroTipo(tipo)
    setSoloAceptadas(aceptadas)
  }

  const abrirConfig = () => {
    setConfig({ ...savedConfig, clave: '', factilizaToken: '' })
    setConfigResult(null)
    setClaveError(null)
    setClave('')
    setCertFile(null)
    setCertClave('')
    setCertMsg(null)
    setConfigOpen(true)
  }

  const handleSaveConfig = async () => {
    if (config.proveedor === 'sunat' && !canalDirectoDisponible) return
    setSavingConfig(true)
    setConfigResult(null)
    try {
      await apiSaveSunatConfig(config)
      setSavedConfig({
        ...config, clave: '', factilizaToken: '',
        claveSolGuardada: config.claveSolGuardada || Boolean(config.clave.trim()),
        factilizaTokenGuardado: config.factilizaTokenGuardado || Boolean(config.factilizaToken.trim()),
      })
      const status = await apiEmisionEstado()
      setEmisionActiva(Boolean(status.activa))
      setDirecta(Boolean(status.directa))
      setCanalDirectoDisponible(typeof status.directa === 'boolean')
      setDisponible(status.disponible ?? Boolean(status.activa))
      setConfigOpen(false)
      setLastResult('Configuración SUNAT guardada.')
    } catch (e) {
      setConfigResult((e as Error).message)
    } finally {
      setSavingConfig(false)
    }
  }

  const probar = async (tipo: 'boleta' | 'factura') => {
    setTesting(tipo)
    setConfigResult(null)
    try {
      const test = await apiProbarSunat(tipo)
      setConfigResult(`SUNAT Beta · ${tipo} · código ${test.codigo}${test.mensaje ? ' · ' + test.mensaje : ''}`)
    } catch (e) {
      setConfigResult((e as Error).message)
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
        certificadoClave: info.tieneClave,
      }))
      setSavedConfig((prev) => ({ ...prev, certificadoCargado: info.cargado, certificadoNombre: info.nombre, certificadoClave: info.tieneClave }))
      setCertFile(null)
      setCertClave('')
      setCertMsg(`Certificado guardado: ${info.nombre}`)
    } catch (e) {
      setCertMsg((e as Error).message)
    } finally {
      setCertSending(false)
    }
  }

  const selectedOrder = queue[queueAt] ?? null
  const igvRate = state.settings.igvRate > 0 ? state.settings.igvRate : 0.18

  const cargarPedido = (order: Order) => {
    const tipo = order.docTipo === 'factura' ? 'factura' : 'boleta'
    setEmitType(tipo)
    setIncluyeIgv(directa || tipo === 'factura')
    setEmail(order.docEmail || '')
    setLines(detalleDe(order, directa))
  }

  const abrirCola = (orders: Order[]) => {
    if (!orders.length) return
    setQueue(orders)
    setQueueAt(0)
    cargarPedido(orders[0])
    setEmitOpen(true)
  }

  const irA = (index: number) => {
    const order = queue[index]
    if (!order) return
    setQueueAt(index)
    cargarPedido(order)
  }

  const elegirTipo = (tipo: 'boleta' | 'factura') => {
    setEmitType(tipo)
    setIncluyeIgv(directa || tipo === 'factura')
  }

  const handleEmit = async () => {
    if (!selectedOrder) return
    const cliente = clienteComprobante(selectedOrder, emitType, directa)
    if (!cliente.ok) {
      setLastResult('Completa el documento y el nombre del cliente en el pedido.')
      return
    }
    if (!lines.some((line) => line.descripcion.trim() && line.cantidad > 0)) {
      setLastResult('Agrega al menos un detalle antes de emitir.')
      return
    }
    if (!disponible) {
      setLastResult('Revisa el estado de emisión en Configurar SUNAT.')
      return
    }
    setSending(true)
    setLastResult(null)
    try {
      const result = await apiEmitComprobante({
        orderId: selectedOrder.id,
        tipo: emitType,
        email: email.trim(),
        incluyeIgv,
        igvRate,
        cliente: {
          tipDoc: cliente.tipDoc,
          num: cliente.num,
          nombre: cliente.nombre,
          direccion: selectedOrder.docAddress || '-',
        },
        lines: lines
          .filter((line) => line.descripcion.trim() && line.cantidad > 0)
          .map((line) => ({ descripcion: line.descripcion.trim(), cantidad: line.cantidad, precio: line.precio })),
      })
      setInvoices((prev) => [result.invoice, ...prev.filter((inv) => inv.orderId !== result.invoice.orderId)])
      setPicked((prev) => prev.filter((id) => id !== result.invoice.orderId))
      void apiComprobanteFiles().then((r) => setFiles(r.files || {})).catch(() => undefined)
      const numero = String(result.invoice.numero).padStart(8, '0')
      setLastResult(`${result.invoice.tipo} ${result.invoice.serie}-${numero} · ${result.invoice.status}${result.invoice.mensaje ? ' · ' + result.invoice.mensaje : ''}`)
      if (result.invoice.status === 'aceptada' && queueAt < queue.length - 1) irA(queueAt + 1)
      else {
        setEmitOpen(false)
        setVista('emitidos')
      }
    } catch (e) {
      setLastResult((e as Error).message || 'No se pudo emitir')
    } finally {
      setSending(false)
    }
  }

  const reintentar = async (orderId: string) => {
    setRetrying(orderId)
    setLastResult(null)
    try {
      const { invoice } = await apiReintentarComprobante(orderId)
      setInvoices((prev) => prev.map((item) => item.orderId === orderId ? invoice : item))
      setLastResult(`${invoice.serie}-${invoice.numero} · ${invoice.status}${invoice.mensaje ? ' · ' + invoice.mensaje : ''}`)
      void apiComprobanteFiles().then((r) => setFiles(r.files || {})).catch(() => undefined)
    } catch (e) {
      setLastResult((e as Error).message)
    } finally {
      setRetrying(null)
    }
  }

  const activar = async () => {
    if (!clave.trim()) {
      setClaveError('Escribe la clave')
      return
    }
    setActivando(true)
    setClaveError(null)
    try {
      const r = await apiActivarEmision(clave)
      if (!r.activa) {
        setClaveError('La clave no es correcta')
        return
      }
      setEmisionActiva(true)
      setDisponible(r.disponible ?? true)
      setClave('')
      setLastResult('Emisión activada.')
    } catch (e) {
      setClaveError((e as Error).message || 'La clave no es correcta')
    } finally {
      setActivando(false)
    }
  }

  const statusIcon = (s: InvoiceStatus) => {
    if (s === 'aceptada') return <CheckCircle2 size={14} className="text-green-600" />
    if (s === 'rechazada') return <AlertCircle size={14} className="text-red-600" />
    return <RefreshCw size={14} className="text-amber-600" />
  }

  const estado = emisionActiva === null ? 'Estado sin confirmar' : disponible ? 'Emisión activa' : 'Emisión inactiva'
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
                <span>{directa ? 'SUNAT directo' : 'Factiliza'} · {savedConfig.ambiente === 'produccion' ? 'Producción' : 'Beta'}</span>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink/75">Pedidos pagados sin comprobante</h2>
            <button
              type="button"
              disabled={!picked.length}
              onClick={() => abrirCola(pendingOrders.filter((o) => picked.includes(o.id)))}
              className="flex min-h-9 items-center gap-1 rounded-xl bg-ember px-3 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Send size={12} /> Revisar {picked.length || ''} seleccionados
            </button>
          </div>
          {pendingOrders.length === 0 ? (
            <p className="card mt-3 p-4 text-sm text-ink/60">No hay pedidos pagados sin comprobante.</p>
          ) : (
            <div className="mt-3 divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/12 bg-surface">
              {pendingOrders.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:px-4">
                  <label className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={picked.includes(o.id)}
                      onChange={(e) => setPicked((prev) => e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id))}
                    />
                    <FileText size={18} className="shrink-0 text-ink/30" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{padOrder(o.number)} · {o.customerName}</p>
                      <p className="text-xs leading-relaxed text-ink/70">
                        {formatDateTime(o.createdAt)} · {o.paymentMethod} · {o.docTipo === 'factura' ? 'Factura' : o.docTipo === 'boleta_dni' && directa ? 'Boleta con DNI' : 'Boleta'}
                      </p>
                    </div>
                  </label>
                  <div className="ml-auto flex shrink-0 items-center gap-3">
                    <span className="whitespace-nowrap text-sm font-bold tabular-nums">{soles(o.total)}</span>
                    <button
                      type="button"
                      onClick={() => abrirCola([o])}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink/12 px-3 text-xs font-semibold hover:bg-ink/8 focus-visible:outline-2 focus-visible:outline-ember"
                    >
                      <Send size={13} aria-hidden /> Preparar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink/75">{soloAceptadas ? 'Aceptados por SUNAT' : 'Comprobantes registrados'} ({emitidos.length})</h2>
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
                const order = state.orders.find((o) => o.id === inv.orderId)
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
                      {inv.canal === 'sunat' && inv.mensaje ? (
                        <p className="mt-1 max-w-2xl text-xs text-ink/70">{inv.mensaje}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-xs capitalize">
                        {statusIcon(inv.status)} {inv.status}
                      </span>
                      {inv.canal === 'sunat' && inv.status === 'pendiente' ? (
                        <button type="button" disabled={!disponible || !directa || retrying !== null} onClick={() => void reintentar(inv.orderId)}
                          className="min-h-10 rounded-lg border border-ink/12 px-2.5 text-xs font-semibold text-ember hover:bg-ember/10 disabled:opacity-50">
                          {retrying === inv.orderId ? 'Enviando…' : 'Reintentar envío'}
                        </button>
                      ) : null}
                      {(['pdf', 'xml', 'cdr'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          disabled={!files[inv.orderId]?.[kind] || (inv.canal === 'sunat' && inv.status !== 'aceptada' && kind === 'pdf')}
                          className="text-xs font-bold uppercase text-ember disabled:text-ink/30"
                          onClick={() => void apiDownloadComprobante(inv.orderId, kind).catch((e) => setLastResult((e as Error).message))}
                        >
                          {kind}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Emit Modal */}
      <Modal open={emitOpen} title={queue.length > 1 ? `Preparar ${queueAt + 1} de ${queue.length}` : 'Preparar comprobante'} onClose={() => setEmitOpen(false)} wide>
        {selectedOrder && (() => {
          const cliente = clienteComprobante(selectedOrder, emitType, directa)
          const total = totalDetalle(lines)
          const dinero = incluyeIgv ? separarIgv(total, igvRate) : null
          return (
            <div className="space-y-4">
              <p className="text-sm text-ink/60">
                Pedido <strong>{padOrder(selectedOrder.number)}</strong> · {selectedOrder.customerName} · <strong>{soles(selectedOrder.total)}</strong>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => elegirTipo('boleta')} className={`flex-1 rounded-xl py-3 text-sm font-bold ${emitType === 'boleta' ? 'bg-ink text-cream' : 'bg-cream'}`}>
                  {directa ? 'Boleta' : 'Boleta general'}
                </button>
                <button type="button" onClick={() => elegirTipo('factura')} className={`flex-1 rounded-xl py-3 text-sm font-bold ${emitType === 'factura' ? 'bg-ink text-cream' : 'bg-cream'}`}>
                  Factura
                </button>
              </div>
              <div className="rounded-xl bg-cream px-3 py-2 text-xs text-ink/70">
                {emitType === 'boleta' && cliente.tipDoc === '0' ? (
                  <>
                    <p className="font-semibold text-ink">CLIENTES VARIOS</p>
                    {!cliente.ok ? <p className="mt-1 font-semibold text-amber-800 dark:text-amber-300">Para este importe, registra el DNI y nombre del cliente en el pedido.</p> : null}
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-ink">{cliente.nombre || 'Sin razón social'}</p>
                    <p>{cliente.tipDoc === '6' ? 'RUC' : 'DNI'} {cliente.num || '—'}</p>
                    {!cliente.ok ? <p className="mt-1 font-semibold text-amber-800 dark:text-amber-300">Completa el documento y el nombre en el pedido.</p> : null}
                  </>
                )}
              </div>
              {!directa ? <Field label="Correo del cliente">
                <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`Vacío: se envía a ${CORREO_LOCAL}`} />
              </Field> : null}
              {!directa ? <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={incluyeIgv}
                  onChange={(e) => setIncluyeIgv(e.target.checked)}
                />
                El monto incluye IGV {emitType === 'factura' ? '(activo en factura)' : ''}
              </label> : null}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Detalle</p>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => [...prev, { descripcion: '', cantidad: 1, precio: 0 }])}
                    className="inline-flex items-center gap-1 text-xs font-bold text-ember"
                  >
                    <Plus size={14} /> Agregar línea
                  </button>
                </div>
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-[1fr_4.5rem_5.5rem_2rem] gap-2">
                    <input
                      className={inputClass}
                      value={line.descripcion}
                      placeholder="Descripción"
                      onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? { ...row, descripcion: e.target.value } : row))}
                    />
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={line.cantidad}
                      onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? { ...row, cantidad: Number(e.target.value) || 0 } : row))}
                    />
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={line.precio}
                      onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? { ...row, precio: Number(e.target.value) || 0 } : row))}
                    />
                    <button type="button" aria-label="Quitar línea" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} className="flex items-center justify-center text-ink/40">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              {dinero ? (
                <p className="text-sm text-ink/70">
                  Total {soles(dinero.total)} · base {soles(dinero.base)} · IGV {soles(dinero.igv)}
                </p>
              ) : (
                <p className="text-sm text-ink/70">Total {soles(total)}</p>
              )}
              <div className="flex gap-2">
                {queue.length > 1 ? (
                  <button type="button" disabled={queueAt === 0} onClick={() => irA(queueAt - 1)} className="min-h-11 rounded-xl border border-ink/12 px-3 text-sm font-bold disabled:opacity-40">
                    Anterior
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleEmit()}
                  disabled={sending || !disponible || !cliente.ok || (directa && total !== selectedOrder.total)}
                  className="min-h-11 flex-1 rounded-xl bg-ember font-semibold text-white disabled:opacity-50"
                >
                  {sending ? 'Revisando…' : 'Emitir'}
                </button>
                {queue.length > 1 ? (
                  <button type="button" disabled={queueAt >= queue.length - 1} onClick={() => irA(queueAt + 1)} className="min-h-11 rounded-xl border border-ink/12 px-3 text-sm font-bold disabled:opacity-40">
                    Siguiente
                  </button>
                ) : null}
              </div>
              {!disponible ? <p className="text-sm text-ink/70">La emisión se habilita en Configurar SUNAT.</p> : null}
              {directa && total !== selectedOrder.total ? (
                <p className="text-sm text-amber-800 dark:text-amber-300">El detalle debe sumar el importe pagado de {soles(selectedOrder.total)}.</p>
              ) : null}
            </div>
          )
        })()}
      </Modal>

      <Modal open={configOpen} title="Configurar SUNAT" onClose={() => setConfigOpen(false)} closeDisabled={savingConfig || activando || certSending || testing !== null} wide>
        <div className="space-y-5">
          <section aria-labelledby="activar-emision" className="rounded-xl border border-ink/12 bg-cream px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <h3 id="activar-emision" className="inline-flex items-center gap-2 text-sm font-bold"><Key size={15} aria-hidden /> Activar emisión</h3>
              <span className={`text-xs font-semibold ${emisionActiva ? 'text-ember' : 'text-ink/70'}`}>
                {emisionActiva === null ? 'Estado sin confirmar' : emisionActiva ? 'Activada' : 'Pendiente de activación'}
              </span>
            </div>
            {emisionActiva === false ? (
              <form className="mt-3 flex flex-wrap items-end gap-2.5" onSubmit={(event) => { event.preventDefault(); void activar() }}>
                <div className="min-w-36 flex-1">
                  <Field label="Clave de activación">
                    <input className={inputClass} type="password" value={clave} autoComplete="off"
                      aria-invalid={Boolean(claveError)} aria-describedby={claveError ? 'activacion-error' : undefined}
                      onChange={(e) => setClave(e.target.value)} />
                  </Field>
                </div>
                <button type="submit" disabled={activando} className="min-h-12 rounded-xl bg-ember px-4 text-sm font-semibold text-white disabled:opacity-50 dark:text-cream">
                  {activando ? 'Activando…' : 'Activar'}
                </button>
                {claveError ? <p id="activacion-error" role="alert" className="w-full text-xs font-medium text-amber-800 dark:text-amber-300">{claveError}</p> : null}
              </form>
            ) : null}
          </section>

          {admin ? (
            <>
              <section aria-label="Canal y datos del emisor" className="grid gap-3 sm:grid-cols-2">
                <Field label="Canal de emisión">
                  <select className={inputClass} value={config.proveedor} onChange={(event) => {
                    const proveedor = event.target.value as SunatConfig['proveedor']
                    setConfig((prev) => proveedor === 'sunat'
                      ? { ...prev, proveedor, ambiente: 'beta', enabled: false }
                      : { ...prev, proveedor })
                  }}>
                    <option value="factiliza">Factiliza</option>
                    <option value="sunat">SUNAT directo</option>
                  </select>
                </Field>
                <Field label="Ambiente">
                  <select className={inputClass} value={config.ambiente} onChange={(e) => setConfig({ ...config, ambiente: e.target.value as SunatConfig['ambiente'] })}>
                    <option value="beta">Beta (pruebas)</option>
                    <option value="produccion">Producción</option>
                  </select>
                </Field>
                <Field label="RUC">
                  <input className={inputClass} value={config.ruc} inputMode="numeric" maxLength={11} onChange={(e) => setConfig({ ...config, ruc: e.target.value })} placeholder="20XXXXXXXXX" />
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
              </section>

              {config.proveedor === 'sunat' ? (
                <>
                  <section aria-labelledby="acceso-sol" className="space-y-3 border-t border-ink/12 pt-4">
                    <h3 id="acceso-sol" className="text-sm font-bold">Acceso SUNAT</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Usuario SOL secundario">
                        <input className={inputClass} value={config.usuario} autoComplete="off" onChange={(e) => setConfig({ ...config, usuario: e.target.value })} />
                      </Field>
                      <Field label="Clave SOL">
                        <input className={inputClass} type="password" value={config.clave} autoComplete="new-password"
                          onChange={(e) => setConfig({ ...config, clave: e.target.value })}
                          placeholder={config.claveSolGuardada ? 'Clave guardada' : undefined} />
                      </Field>
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
                    <div>
                      <h3 id="certificado-sunat" className="text-sm font-bold">Certificado digital</h3>
                      <p className="mt-1 break-all text-xs text-ink/70">{config.certificadoCargado ? config.certificadoNombre || 'Certificado guardado' : 'Carga tu certificado .p12 o .pfx.'}</p>
                    </div>
                    <div className="grid items-end gap-3 sm:grid-cols-2">
                      <Field label="Archivo del certificado">
                        <input type="file" accept=".pfx,.p12,application/x-pkcs12" className="block min-h-12 w-full min-w-0 rounded-xl border border-ink/12 p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-ink/8 file:px-2 file:py-1.5"
                          onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
                      </Field>
                      <Field label="Clave del archivo">
                        <input className={inputClass} type="password" value={certClave} autoComplete="new-password" onChange={(e) => setCertClave(e.target.value)} />
                      </Field>
                    </div>
                    <button type="button" disabled={certSending || !certFile} onClick={() => void subirCertificado()}
                      className="min-h-11 rounded-xl border border-ink/15 px-4 text-sm font-semibold hover:bg-ink/8 disabled:opacity-50">
                      {certSending ? 'Subiendo…' : 'Subir certificado'}
                    </button>
                    {certMsg ? <p role="status" className="text-xs text-ink/80">{certMsg}</p> : null}
                  </section>

                  <section aria-labelledby="pruebas-sunat" className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/12 pt-4">
                    <div>
                      <h3 id="pruebas-sunat" className="text-sm font-bold">Validación en SUNAT Beta</h3>
                      <p className="mt-1 text-xs text-ink/70">Envía un comprobante ficticio.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['factura', 'boleta'] as const).map((tipo) => (
                        <button key={tipo} type="button" disabled={!canalDirectoDisponible || testing !== null} onClick={() => void probar(tipo)}
                          className="min-h-11 rounded-xl border border-ink/15 px-3 text-xs font-semibold hover:bg-ink/8 disabled:opacity-50">
                          {testing === tipo ? 'Validando…' : `Probar ${tipo}`}
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <section aria-label="Acceso Factiliza" className="grid gap-3 border-t border-ink/12 pt-4 sm:grid-cols-2">
                  <Field label="URL de facturación">
                    <input className={inputClass} value={config.apiUrl} onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })} />
                  </Field>
                  <Field label="Token Factiliza">
                    <input className={inputClass} type="password" value={config.factilizaToken} autoComplete="new-password"
                      onChange={(e) => setConfig({ ...config, factilizaToken: e.target.value })}
                      placeholder={config.factilizaTokenGuardado ? 'Token guardado' : undefined} />
                  </Field>
                </section>
              )}

              {configResult ? <p role="status" className="rounded-xl border border-ink/12 bg-cream px-3 py-2.5 text-sm text-ink/85">{configResult}</p> : null}
              {config.proveedor === 'sunat' && !canalDirectoDisponible ? (
                <p className="text-sm text-ink/75">Actualiza el backend del POS para habilitar SUNAT directo.</p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/12 pt-4">
                <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} className="h-4 w-4 rounded accent-ember" />
                  {config.proveedor === 'sunat' ? 'Habilitar emisión directa' : 'Habilitado'}
                </label>
                <button type="button" onClick={() => void handleSaveConfig()} disabled={savingConfig || (config.proveedor === 'sunat' && !canalDirectoDisponible)}
                  className="min-h-11 rounded-xl bg-ember px-4 text-sm font-semibold text-white disabled:opacity-50 dark:text-cream">
                  {savingConfig ? 'Guardando…' : 'Guardar configuración'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </section>
  )
}
