import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, Key, Plus, RefreshCw, Send, Settings2, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
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
  apiSaveSunatConfig,
  apiUploadCertificado,
} from '../lib/apiClient'

interface SunatConfig {
  ruc: string
  razonSocial: string
  usuario: string
  clave: string
  certificado: string
  ambiente: 'beta' | 'produccion'
  serieboleta: string
  seriefactura: string
  apiUrl: string
  factilizaToken: string
  enabled: boolean
  certificadoCargado?: boolean
  certificadoNombre?: string
  certificadoClave?: boolean
}

const DEFAULT_SUNAT: SunatConfig = {
  ruc: '',
  razonSocial: '',
  usuario: '',
  clave: '',
  certificado: '',
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
}

const CLIENTE_GENERICO = { tipDoc: '0', num: '00000000', nombre: 'CLIENTES VARIOS' }
const CORREO_LOCAL = 'comprobante@chifapollerialopez.com'

type DetalleLine = { descripcion: string; cantidad: number; precio: number }

function clienteComprobante(order: Order, tipo: 'boleta' | 'factura') {
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
  return { ...CLIENTE_GENERICO, email: order.docEmail, ok: true }
}

function detalleDe(order: Order): DetalleLine[] {
  const lines = order.items
    .filter((item) => item.qty > 0)
    .map((item) => ({ descripcion: item.name, cantidad: item.qty, precio: item.price }))
  return lines.length ? lines : [{ descripcion: 'Consumo', cantidad: 1, precio: order.total }]
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
  const [config, setConfig] = useState<SunatConfig>(DEFAULT_SUNAT)
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
  const [clave, setClave] = useState('')
  const [claveError, setClaveError] = useState<string | null>(null)
  const [activando, setActivando] = useState(false)

  useEffect(() => {
    void apiGetSunatConfig()
      .then((r) => {
        if (r.config && typeof r.config === 'object') setConfig({ ...DEFAULT_SUNAT, ...(r.config as SunatConfig) })
      })
      .catch(() => undefined)
    void apiGetInvoices()
      .then((r) => setInvoices((r.invoices as Invoice[]) || []))
      .catch(() => undefined)
    void apiComprobanteFiles()
      .then((r) => setFiles(r.files || {}))
      .catch(() => undefined)
    void apiEmisionEstado()
      .then((r) => setEmisionActiva(Boolean(r.activa)))
      .catch(() => setEmisionActiva(false))
  }, [])

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

  const handleSaveConfig = async () => {
    try {
      const { certificadoCargado, certificadoNombre, certificadoClave, ...resto } = config
      await apiSaveSunatConfig(resto)
      setConfig((prev) => ({ ...prev, certificadoCargado, certificadoNombre, certificadoClave }))
      setConfigOpen(false)
      setLastResult('Configuración SUNAT guardada en API')
    } catch (e) {
      setLastResult((e as Error).message)
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
    setIncluyeIgv(tipo === 'factura')
    setEmail(order.docEmail || '')
    setLines(detalleDe(order))
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
    setIncluyeIgv(tipo === 'factura')
  }

  const handleEmit = async () => {
    if (!selectedOrder) return
    const cliente = clienteComprobante(selectedOrder, emitType)
    if (!cliente.ok) {
      setLastResult('La factura exige RUC y razón social. No se permite emitir.')
      return
    }
    if (!lines.some((line) => line.descripcion.trim() && line.cantidad > 0)) {
      setLastResult('Agrega al menos un detalle antes de emitir.')
      return
    }
    if (!emisionActiva) {
      setLastResult('Primero activa la emisión con la clave. Se pide una sola vez.')
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
      void apiComprobanteFiles().then((r) => setFiles(r.files || {})).catch(() => undefined)
      const numero = String(result.invoice.numero).padStart(8, '0')
      setLastResult(`${result.invoice.tipo} ${result.invoice.serie}-${numero} ${result.invoice.status}`)
      if (queueAt < queue.length - 1) irA(queueAt + 1)
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
      setClave('')
      setLastResult('Emisión activada. La clave no se vuelve a pedir.')
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

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title="Facturación electrónica" hint="Pedidos por facturar y comprobantes ya emitidos." />
        <button
          onClick={() => setConfigOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream"
        >
          <Settings2 size={16} /> Configurar SUNAT
        </button>
      </div>

      {/* Status bar */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${config.enabled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {config.enabled ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {config.enabled ? `Conectado · ${config.ambiente === 'beta' ? 'Beta' : 'Producción'}` : 'No configurado'}
        </div>
        {config.ruc && (
          <span className="text-sm text-ink/50">RUC: {config.ruc}</span>
        )}
        {lastResult && (
          <span className={`text-sm font-medium ${lastResult.startsWith('Error') || lastResult.includes('No se permite') || lastResult.includes('exige') ? 'text-amber-800' : 'text-green-600'}`}>
            {lastResult}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-ink/60">
        {emisionActiva
          ? `La emisión está activa. La boleta abre en general. Si eliges factura, el monto ya incluye IGV y se le resta. Sin correo del cliente, el comprobante saldría de ${CORREO_LOCAL}.`
          : 'La emisión está apagada. La clave se pide una sola vez: si no es la correcta, no se activa.'}
      </p>
      {emisionActiva === false ? (
        <div className="card mt-4 max-w-md space-y-3 p-4">
          <p className="text-sm font-semibold">Activar emisión</p>
          <Field label="Clave">
            <input
              className={inputClass}
              type="password"
              value={clave}
              autoComplete="off"
              placeholder="Clave de activación"
              onChange={(e) => setClave(e.target.value)}
            />
          </Field>
          {claveError ? <p className="text-xs font-medium text-amber-700">{claveError}</p> : null}
          <button
            type="button"
            disabled={activando}
            onClick={() => void activar()}
            className="min-h-10 rounded-xl bg-ember px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {activando ? 'Revisando…' : 'Activar'}
          </button>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button type="button" onClick={() => setVista('pendientes')} className="card p-4 text-left">
          <p className="text-2xl font-display">{pendingOrders.length}</p>
          <p className="text-xs text-ink/50">Por facturar</p>
        </button>
        <button type="button" onClick={() => verEmitidos('boleta')} className="card p-4 text-left">
          <p className="text-2xl font-display">{invoices.filter((i) => i.tipo === 'boleta').length}</p>
          <p className="text-xs text-ink/50">Boletas emitidas</p>
        </button>
        <button type="button" onClick={() => verEmitidos('factura')} className="card p-4 text-left">
          <p className="text-2xl font-display">{invoices.filter((i) => i.tipo === 'factura').length}</p>
          <p className="text-xs text-ink/50">Facturas emitidas</p>
        </button>
        <button type="button" onClick={() => verEmitidos('todos', true)} className="card p-4 text-left">
          <p className="text-2xl font-display">{invoices.filter((i) => i.status === 'aceptada').length}</p>
          <p className="text-xs text-ink/50">Aceptadas SUNAT</p>
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVista('pendientes')}
          className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${vista === 'pendientes' ? 'bg-ink text-cream' : 'bg-cream text-ink'}`}
        >
          Por facturar ({pendingOrders.length})
        </button>
        <button
          type="button"
          onClick={() => verEmitidos('todos')}
          className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${vista === 'emitidos' ? 'bg-ink text-cream' : 'bg-cream text-ink'}`}
        >
          Documentos emitidos ({invoices.length})
        </button>
      </div>

      {vista === 'pendientes' ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink/60">Pedidos pagados sin comprobante ({pendingOrders.length})</h2>
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
            <div className="mt-3 space-y-2">
              {pendingOrders.map((o) => (
                <div key={o.id} className="card flex items-center justify-between gap-3 p-3">
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
                      <p className="text-xs text-ink/50">
                        {formatDateTime(o.createdAt)} · {o.paymentMethod} · {o.docTipo === 'factura' ? 'Factura' : 'Boleta · CLIENTES VARIOS'}
                      </p>
                    </div>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{soles(o.total)}</span>
                    <button
                      onClick={() => abrirCola([o])}
                      className="flex min-h-9 items-center gap-1 rounded-xl bg-ink px-3 text-xs font-semibold text-cream"
                    >
                      <Send size={12} /> Preparar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink/60">Documentos emitidos ({emitidos.length}{soloAceptadas ? ' aceptados' : ''})</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className={`${inputClass} w-52`}
                value={buscarEmitido}
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
              Todavía no hay comprobantes emitidos. Cuando se permita emitir, aquí salen todos, con PDF, XML y CDR.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {emitidos.map((inv) => {
                const order = state.orders.find((o) => o.id === inv.orderId)
                return (
                  <div key={`${inv.orderId}-${inv.serie}-${inv.numero}`} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize">
                        {inv.tipo} {inv.serie}-{String(inv.numero).padStart(8, '0')}
                      </p>
                      <p className="text-xs text-ink/50">
                        {order ? `${padOrder(order.number)} · ${order.customerName} · ${soles(order.total)}` : inv.clienteNombre || 'Pedido'}
                        {' · '}{formatDateTime(inv.fechaEmision)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-xs capitalize">
                        {statusIcon(inv.status)} {inv.status}
                      </span>
                      {(['pdf', 'xml', 'cdr'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          disabled={!files[inv.orderId]?.[kind]}
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
          const cliente = clienteComprobante(selectedOrder, emitType)
          const total = totalDetalle(lines)
          const dinero = incluyeIgv ? separarIgv(total, igvRate) : null
          return (
            <div className="space-y-4">
              <p className="text-sm text-ink/60">
                Pedido <strong>{padOrder(selectedOrder.number)}</strong> · {selectedOrder.customerName} · <strong>{soles(selectedOrder.total)}</strong>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => elegirTipo('boleta')} className={`flex-1 rounded-xl py-3 text-sm font-bold ${emitType === 'boleta' ? 'bg-ink text-cream' : 'bg-cream'}`}>
                  Boleta general
                </button>
                <button type="button" onClick={() => elegirTipo('factura')} className={`flex-1 rounded-xl py-3 text-sm font-bold ${emitType === 'factura' ? 'bg-ink text-cream' : 'bg-cream'}`}>
                  Factura
                </button>
              </div>
              <div className="rounded-xl bg-cream px-3 py-2 text-xs text-ink/70">
                {emitType === 'boleta' ? (
                  <>
                    <p className="font-semibold text-ink">CLIENTES VARIOS</p>
                    <p>Doc. 00000000</p>
                    <p>Boleta por defecto. Sin DNI ni RUC usa estos valores.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-ink">{cliente.nombre || 'Sin razón social'}</p>
                    <p>RUC {cliente.num || '—'}</p>
                    {!cliente.ok ? <p className="mt-1 font-semibold text-amber-800">La factura exige RUC y razón social.</p> : null}
                  </>
                )}
              </div>
              <Field label="Correo del cliente">
                <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`Vacío: se envía a ${CORREO_LOCAL}`} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={incluyeIgv}
                  onChange={(e) => setIncluyeIgv(e.target.checked)}
                />
                El monto incluye IGV {emitType === 'factura' ? '(activo en factura)' : ''}
              </label>
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
                  disabled={sending || !emisionActiva || (emitType === 'factura' && !cliente.ok)}
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
            </div>
          )
        })()}
      </Modal>

      {/* Config Modal */}
      <Modal open={configOpen} title="Configuración SUNAT" onClose={() => setConfigOpen(false)} wide>
        <div className="space-y-3">
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
            <strong>Importante:</strong> Para facturación electrónica en producción necesitas:
            certificado digital (.pfx), clave SOL, y estar habilitado como emisor electrónico en SUNAT.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="RUC">
              <input className={inputClass} value={config.ruc} onChange={(e) => setConfig({ ...config, ruc: e.target.value })} placeholder="20XXXXXXXXX" />
            </Field>
            <Field label="Razón Social">
              <input className={inputClass} value={config.razonSocial} onChange={(e) => setConfig({ ...config, razonSocial: e.target.value })} placeholder="Chifa-Pollería Lopez S.A.C." />
            </Field>
            <Field label="Usuario SOL (secundario)">
              <input className={inputClass} value={config.usuario} onChange={(e) => setConfig({ ...config, usuario: e.target.value })} placeholder="MODDATOS" />
            </Field>
            <Field label="Clave SOL / API Key">
              <input className={inputClass} type="password" value={config.clave} onChange={(e) => setConfig({ ...config, clave: e.target.value })} placeholder="••••••••" />
            </Field>
            <Field label="Serie Boleta">
              <input className={inputClass} value={config.serieboleta} onChange={(e) => setConfig({ ...config, serieboleta: e.target.value })} placeholder="B001" />
            </Field>
            <Field label="Serie Factura">
              <input className={inputClass} value={config.seriefactura} onChange={(e) => setConfig({ ...config, seriefactura: e.target.value })} placeholder="F001" />
            </Field>
          </div>
          <div className="space-y-2 rounded-xl border border-ink/10 p-3">
            <p className="text-sm font-semibold">Certificado digital (.pfx o .p12)</p>
            <p className="text-xs text-ink/60">
              {config.certificadoCargado
                ? `Guardado en el servidor: ${config.certificadoNombre || 'certificado.pfx'}${config.certificadoClave ? ' · clave guardada' : ''}. Sirve el de Llama.pe o el de SUNAT.`
                : 'Todavía no hay certificado. Sube el .pfx de Llama.pe o el de SUNAT. El .cer no firma.'}
            </p>
            <input
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              className="block w-full text-sm"
              onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
            />
            <Field label="Clave del certificado">
              <input
                className={inputClass}
                type="password"
                value={certClave}
                onChange={(e) => setCertClave(e.target.value)}
                placeholder={config.certificadoClave ? 'Ya hay una clave. Escríbela solo si la cambias' : 'La clave del archivo, no la clave SOL'}
              />
            </Field>
            {certMsg ? <p className="text-xs font-medium text-ink/70">{certMsg}</p> : null}
            <button
              type="button"
              disabled={certSending}
              onClick={() => void subirCertificado()}
              className="min-h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-cream disabled:opacity-50"
            >
              {certSending ? 'Subiendo…' : 'Subir certificado'}
            </button>
          </div>
          <Field label="URL API facturación">
            <input className={inputClass} value={config.apiUrl} onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })} placeholder="https://api.factiliza.com/v1" />
          </Field>
          <Field label="Token Factiliza (DNI, RUC y correo)">
            <input className={inputClass} type="password" value={config.factilizaToken} onChange={(e) => setConfig({ ...config, factilizaToken: e.target.value })} placeholder="Token guardado en el servidor" />
          </Field>
          <div className="flex items-center gap-4">
            <Field label="Ambiente">
              <select className={inputClass} value={config.ambiente} onChange={(e) => setConfig({ ...config, ambiente: e.target.value as 'beta' | 'produccion' })}>
                <option value="beta">Beta (pruebas)</option>
                <option value="produccion">Producción</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 pt-5 text-sm">
              <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} className="h-4 w-4 rounded" />
              Habilitado
            </label>
          </div>
          <div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-700">
            <Key size={12} className="mb-1 inline" /> El certificado y el token quedan en el servidor. La emisión arranca solo con la clave, y esa clave se pide una sola vez. El PDF, el XML y el CDR quedan en Documentos emitidos.
          </div>
          <button onClick={handleSaveConfig} className="w-full rounded-xl bg-ember py-3 font-semibold text-white">
            Guardar configuración
          </button>
        </div>
      </Modal>
    </div>
  )
}
