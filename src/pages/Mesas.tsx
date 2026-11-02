import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CircleAlert, CircleUserRound, Clock3, Eye, LayoutGrid, LockKeyhole, Plus, Printer, Search, Table2, Users, Wallet, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/StoreContext'
import { useAuth } from '../auth/AuthContext'
import { padOrder, reconcileOrderMoney, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { staffLabel } from '../lib/staffLabel'
import { orderBelongsToStaff } from '../lib/realtime'
import type { Order, Table, TableStatus } from '../types'
import { tablesForStaff } from '../lib/staffBranch'
import { Empty } from '../components/ui'
import { NuevoPedidoButton } from '../components/NuevoPedido'
import { OrderPeople } from '../components/OrderPeople'
import { OrderItemsDialog } from '../components/OrderItemsDialog'

const STATUS_LABEL: Record<TableStatus, string> = { libre: 'Libre', ocupada: 'Ocupada', cuenta: 'Por cobrar' }
const FILTERS = [
  { id: 'todas' as const, label: 'Todas', icon: LayoutGrid },
  { id: 'libre' as const, label: 'Libres', icon: Table2 },
  { id: 'ocupada' as const, label: 'Ocupadas', icon: Users },
  { id: 'cuenta' as const, label: 'Por cobrar', icon: Wallet },
]

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
}

function waitingTime(createdAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000))
  if (!Number.isFinite(minutes)) return ''
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function Mesas() {
  const { state, updateOrderStatus, reloadFromApi, apiLoading } = useStore()
  const { user, actingRole } = useAuth()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TableStatus | 'todas'>('todas')
  const [zone, setZone] = useState('')
  const [query, setQuery] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const tables = useMemo(() => tablesForStaff(state.tables, user, actingRole), [state.tables, user, actingRole])
  const ordersById = useMemo(() => new Map(state.orders.map((order) => [order.id, order])), [state.orders])
  const zones = useMemo(() => [...new Set(tables.map((table) => table.zone))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })), [tables])
  const isMozo = actingRole === 'mozo'
  const counts = useMemo(() => ({
    todas: tables.length,
    libre: tables.filter((table) => table.status === 'libre').length,
    ocupada: tables.filter((table) => table.status === 'ocupada').length,
    cuenta: tables.filter((table) => table.status === 'cuenta').length,
  }), [tables])
  const visibleTables = useMemo(() => tables.filter((table) => {
    if (filter !== 'todas' && table.status !== filter) return false
    if (zone && table.zone !== zone) return false
    const order = table.orderId ? ordersById.get(table.orderId) : undefined
    if (onlyMine && (!order || !orderBelongsToStaff(order, user))) return false
    if (!query.trim()) return true
    const haystack = `Mesa ${table.number} ${String(table.number).padStart(2, '0')} ${table.zone} ${order?.customerName || ''} ${order ? staffLabel(order, state.users) : ''}`
    return normalize(haystack).includes(normalize(query))
  }), [tables, filter, zone, query, ordersById, onlyMine, user, state.users])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }, 30000)
    return () => window.clearInterval(timer)
  }, [])

  const openTable = (table: Table, order?: Order) => {
    if (table.status === 'libre') navigate(`/pos?mesa=${table.id}`)
    else if (order) navigate(`/pos?mesa=${table.id}&agregar=${order.id}`)
  }
  const clearFilters = () => { setFilter('todas'); setZone(''); setQuery(''); setOnlyMine(false) }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="mb-1 text-[10px] font-bold tracking-[0.16em] text-ember uppercase">Operación del salón</p><h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Mesas</h1></div>
          <NuevoPedidoButton className="shrink-0 !rounded-xl !px-3 !text-xs !shadow-none sm:!px-4 sm:!text-sm" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink/55 sm:text-sm">Cada mesa, su cliente y quién la atiende. Toca para continuar.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Filtrar mesas por estado">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} className={`table-filter card flex min-h-16 items-center gap-2.5 px-3.5 py-3 text-left sm:min-h-20 sm:gap-3 sm:px-4 ${filter === id ? 'table-filter-selected' : ''}`}>
            <span className={`table-filter-icon table-status-${id} flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10`}><Icon size={18} /></span>
            <span className="min-w-0"><span className="block text-xl font-extrabold leading-none tabular-nums">{counts[id]}</span><span className="mt-1.5 block text-[11px] text-ink/55">{label}</span></span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block min-w-0 flex-1 sm:max-w-md">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar mesa, cliente o mozo" placeholder="Buscar mesa, cliente o mozo…" className="min-h-11 w-full rounded-xl border border-ink/10 bg-surface py-2.5 pl-10 pr-10 text-sm outline-none placeholder:text-ink/35" />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda de mesas" className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center rounded-xl text-ink/40"><X size={15} /></button> : null}
        </label>
        <div className="flex items-center gap-3 sm:contents">
        <label className="min-w-0 flex-1 sm:max-w-52">
          <span className="sr-only">Ambiente</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)} className="min-h-11 w-full rounded-xl border border-ink/10 bg-surface px-3 py-2 text-sm text-ink/65 outline-none">
            <option value="">Todos los ambientes</option>
            {zones.map((item) => <option key={item} value={item}>Ambiente {item}</option>)}
          </select>
        </label>
        <span className="shrink-0 text-[11px] text-ink/45 sm:ml-auto sm:text-xs">{visibleTables.length} de {tables.length} mesas</span>
        </div>
        {isMozo ? <button type="button" onClick={() => setOnlyMine((value) => !value)} aria-pressed={onlyMine} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold ${onlyMine ? 'border-ember/30 bg-ember/10 text-ember' : 'border-ink/10 bg-surface text-ink/55'}`}><CircleUserRound size={16} /> Mis mesas</button> : null}
      </div>

      {visibleTables.length === 0 ? <div className="text-center"><Empty title={tables.length ? 'No hay mesas con estos filtros' : 'Aún no hay mesas registradas'} hint={tables.length ? 'Prueba con otro estado, ambiente, cliente o mozo.' : 'Las mesas del local aparecerán aquí.'} />{tables.length ? <button type="button" onClick={clearFilters} className="mt-3 min-h-11 px-4 text-sm font-bold text-ember">Limpiar filtros</button> : null}</div> : null}

      {zones.map((item) => {
        const zoneTables = visibleTables.filter((table) => table.zone === item)
        if (!zoneTables.length) return null
        return (
          <section key={item} aria-label={`Ambiente ${item}`}>
            <div className="mb-3 flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ember/8 text-ember"><Table2 size={14} /></span><h2 className="text-sm font-bold">Ambiente {item}</h2><span className="text-[11px] text-ink/40">{zoneTables.length} {zoneTables.length === 1 ? 'mesa' : 'mesas'}</span><span className="ml-1 h-px flex-1 bg-ink/7" /></div>
            <div className="tables-grid">
              {zoneTables.map((table) => {
                const order = table.orderId ? ordersById.get(table.orderId) : undefined
                const locked = Boolean(order && isMozo && user && !orderBelongsToStaff(order, user))
                const available = table.status === 'libre'
                const missingOrder = !available && !order
                const attendant = order ? staffLabel(order, state.users) : ''
                const quantity = order?.items.reduce((sum, entry) => sum + entry.qty, 0) || 0
                return (
                  <article key={table.id} className={`table-card table-card-${table.status} ${locked ? 'table-card-locked' : ''}`}>
                    <button type="button" disabled={locked || missingOrder} onClick={() => openTable(table, order)} aria-label={locked ? `Mesa ${table.number}, atendida por ${attendant}, asignada a otro mozo` : available ? `Mesa ${table.number} libre, tomar pedido` : `Mesa ${table.number}, ${order?.customerName || 'sin cliente'}, atiende ${attendant}, agregar a la comanda`} className="table-card-target absolute inset-0 z-0 h-full w-full rounded-2xl disabled:cursor-default" />
                    <div className="pointer-events-none relative flex flex-1 flex-col p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold tracking-[0.12em] text-ink/45 uppercase">Mesa</span><span className={`table-status-badge table-status-${table.status}`}>{table.status === 'ocupada' ? <CircleAlert size={13} strokeWidth={2.5} /> : table.status === 'cuenta' ? <Wallet size={13} /> : <Check size={12} strokeWidth={2.5} />}{STATUS_LABEL[table.status]}</span></div>
                      <div className="mt-2 flex items-end justify-between gap-2"><h3 className="text-[2.5rem] font-extrabold leading-none tracking-tight tabular-nums">{String(table.number).padStart(2, '0')}</h3><span className="mb-1 flex items-center gap-1.5 text-[11px] text-ink/45"><Users size={13} />{table.seats} asientos</span></div>
                      {available ? (
                        <div className="flex min-h-24 flex-1 flex-col justify-center"><p className="text-sm font-semibold text-ink/65">Lista para recibir</p><p className="mt-1 text-xs text-ink/40">Abre un nuevo pedido aquí</p></div>
                      ) : order ? (
                        <div className="my-4 space-y-3">
                          <OrderPeople customer={order.customerName} attendant={attendant} locked={locked} />
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-ink/45"><span className="font-semibold">{padOrder(order.number)}</span><span className="inline-flex items-center gap-1"><Clock3 size={11} />{waitingTime(order.createdAt, now)}</span></div>
                        </div>
                      ) : <div className="flex min-h-24 flex-1 flex-col justify-center"><p className="text-sm font-semibold">Actualiza el pedido</p><p className="mt-1 text-xs text-ink/45">No se pudieron cargar sus datos.</p></div>}
                      {order ? (
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-ink/7 pt-2">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => setDetailOrderId(order.id)}
                            aria-label={`Ver ${quantity} ${quantity === 1 ? 'producto' : 'productos'} de mesa ${table.number}`}
                            aria-haspopup="dialog"
                            aria-expanded={detailOrderId === order.id}
                            className="pointer-events-auto relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[11px] font-bold text-ember underline decoration-ember/30 underline-offset-4 hover:bg-ember/8 disabled:cursor-default disabled:text-ink/40 disabled:no-underline"
                          >
                            <Eye size={14} /> {quantity} {quantity === 1 ? 'producto' : 'productos'}
                          </button>
                          <span className="ml-auto text-lg font-extrabold tracking-tight tabular-nums">{soles(reconcileOrderMoney(order).total)}</span>
                        </div>
                      ) : null}
                      {available ? <div className="mt-auto flex min-h-10 items-center justify-between border-t border-ink/7 pt-2 text-xs font-bold text-ember"><span className="flex items-center gap-1.5"><Plus size={15} />Tomar pedido</span><ArrowRight size={15} /></div> : null}
                    </div>
                    {!available && !locked && order ? (
                      <div className="relative z-10 grid grid-cols-2 gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
                        <button type="button" onClick={() => openTable(table, order)} className="table-action-primary"><Plus size={14} /> Agregar</button>
                        <button type="button" onClick={() => printTicket(order, state.settings, 'cuenta', state.users)} aria-label={`Imprimir cuenta de mesa ${table.number}`} className="table-action-secondary"><Printer size={14} /> Cuenta</button>
                        {table.status === 'cuenta' ? <button type="button" onClick={() => updateOrderStatus(order.id, 'entregado')} className="table-action-secondary col-span-2"><Check size={14} /> Liberar mesa</button> : null}
                      </div>
                    ) : locked ? <p className="relative mx-4 mb-4 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-ink/4 px-2 text-center text-[10px] text-ink/50"><LockKeyhole size={12} /> Asignada a otro mozo</p> : missingOrder ? <button type="button" disabled={apiLoading} onClick={() => void reloadFromApi()} className="table-action-secondary relative z-10 mx-4 mb-4">{apiLoading ? 'Actualizando…' : 'Actualizar datos'}</button> : null}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
      <OrderItemsDialog orderId={detailOrderId} onClose={() => setDetailOrderId(null)} />
    </div>
  )
}
