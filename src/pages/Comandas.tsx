import { Navigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { useAuth } from '../auth/AuthContext'
import { formatDateTime, padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { staffLabel } from '../lib/staffLabel'
import { orderBelongsToStaff } from '../lib/realtime'
import { apiAssignDriver, apiListDrivers, apiSettleCashier } from '../lib/apiClient'
import { siteUrl } from '../lib/paths'
import { isDeliveryOrder, needsDriver } from '../lib/orderType'
import type { Driver, Order, OrderStatus } from '../types'
import { canCharge } from '../types'
import { Empty, Modal, PageTitle, StatusBadge, TypeBadge } from '../components/ui'
import { CajaCobro } from '../components/CajaCobro'
import { CajaCierre } from '../components/CajaCierre'
import { PrintOrderActions } from '../components/PrintOrderActions'
import { ConfirmProcess } from '../components/ConfirmProcess'

type ComandaFilter = 'por_cobrar' | 'liquidar_caja' | 'historial' | 'todas' | 'delivery' | 'recojo' | OrderStatus

const FILTERS_FULL: { id: ComandaFilter; label: string }[] = [
  { id: 'por_cobrar', label: 'Por cobrar' },
  { id: 'liquidar_caja', label: 'Liquidar' },
  { id: 'historial', label: 'Historial cobros' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'recojo', label: 'Recojo' },
  { id: 'todas', label: 'Todas' },
  { id: 'nuevo', label: 'Nuevas' },
  { id: 'en_cocina', label: 'Cocina' },
  { id: 'listo', label: 'Listas' },
  { id: 'entregado', label: 'Entregadas' },
  { id: 'cancelado', label: 'Canceladas' },
]

/** Cajero: por cobrar, liquidar e historial de cobros */
const FILTERS_CAJA: { id: ComandaFilter; label: string }[] = [
  { id: 'por_cobrar', label: 'Por cobrar' },
  { id: 'liquidar_caja', label: 'Liquidar' },
  { id: 'historial', label: 'Historial cobros' },
]

/** Pedidos web/delivery entregados pero pagados online - pendientes de liquidar en caja */
function needsCashierSettle(o: Order): boolean {
  return (
    (o.type === 'delivery' || o.type === 'web') &&
    o.status === 'entregado' &&
    o.paid === true &&
    !o.driverSettledAt
  )
}

function limaDayStart(ymd: string) {
  return new Date(`${ymd}T05:00:00.000Z`)
}
function limaDayEnd(ymd: string) {
  const d = limaDayStart(ymd)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

function isPendingPayment(o: Order) {
  return !o.paid && o.status !== 'cancelado'
}

/** Mozo: sus mesas + delivery activos (asignar repartidor) + recojos activos. */
function mozoCanSeeOrder(o: Order, user: { id?: string; name?: string }) {
  if (orderBelongsToStaff(o, user)) return true
  if (isDeliveryOrder(o) && o.status !== 'cancelado' && o.status !== 'entregado') return true
  if (o.type === 'llevar' && o.status !== 'cancelado' && o.status !== 'entregado') return true
  if (o.type === 'salon' && o.source === 'web' && o.status !== 'cancelado' && o.status !== 'entregado') return true
  return false
}

export function Comandas() {
  const { state, updateOrderStatus, payOrder, reloadFromApi } = useStore()
  const { user, actingRole } = useAuth()
  const isMozo = actingRole === 'mozo'
  const isCajero = actingRole === 'cajero'
  const mayCharge = canCharge(actingRole)
  const [filter, setFilter] = useState<ComandaFilter>(isCajero ? 'por_cobrar' : 'todas')
  const [custQ, setCustQ] = useState('')
  const [custOpen, setCustOpen] = useState(false)
  const [selected, setSelected] = useState<Order | null>(null)
  const [paying, setPaying] = useState(false)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [assigning, setAssigning] = useState(false)
  const [pickedDriverId, setPickedDriverId] = useState('')
  const [settleDlg, setSettleDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)
  const [cobroFrom, setCobroFrom] = useState(todayYmd)
  const [cobroTo, setCobroTo] = useState(todayYmd)
  const driverAppUrl = siteUrl('driver')

  const assignDriver = async (order: Order, driverId: string | null) => {
    if (assigning) return
    if ((order.driverId || '') === (driverId || '')) return
    setAssigning(true)
    try {
      await apiAssignDriver(order.id, driverId)
      setSelected({
        ...order,
        driverId: driverId || undefined,
        driverName: driverId ? drivers.find((d) => d.id === driverId)?.name : undefined,
      })
      await reloadFromApi()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setAssigning(false)
    }
  }

  useEffect(() => {
    void apiListDrivers()
      .then((r) => setDrivers((r.drivers || []).filter((d) => d.active)))
      .catch(() => setDrivers([]))
  }, [])

  // Cajero siempre arranca en pendientes de pago (salón, llevar, delivery y web)
  useEffect(() => {
    if (isCajero) setFilter('por_cobrar')
  }, [isCajero])

  useEffect(() => {
    if (isMozo) setFilter('todas')
  }, [isMozo])

  const pendingPayCount = useMemo(
    () =>
      state.orders.filter((o) => {
        if (isMozo && user && !mozoCanSeeOrder(o, user)) return false
        return isPendingPayment(o)
      }).length,
    [state.orders, isMozo, user],
  )

  const needDriverCount = useMemo(
    () =>
      state.orders.filter(
        (o) => needsDriver(o) && (!isMozo || !user || mozoCanSeeOrder(o, user)),
      ).length,
    [state.orders, isMozo, user],
  )

  const recojoCount = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          o.type === 'llevar' &&
          o.status !== 'cancelado' &&
          o.status !== 'entregado' &&
          (!isMozo || !user || mozoCanSeeOrder(o, user)),
      ).length,
    [state.orders, isMozo, user],
  )

  const cashierSettleCount = useMemo(
    () => state.orders.filter(needsCashierSettle).length,
    [state.orders],
  )

  const custNeedle = custQ.trim().toLowerCase()
  const custPhone = custQ.replace(/\D/g, '')
  const custHits = useMemo(() => {
    if (custNeedle.length < 2 && custPhone.length < 3) return []
    const seen = new Set<string>()
    const out: { name: string; phone?: string }[] = []
    const push = (name: string, phone?: string) => {
      const key = `${name.toLowerCase()}|${(phone || '').replace(/\D/g, '').slice(-9)}`
      if (seen.has(key)) return
      seen.add(key)
      out.push({ name, phone })
    }
    for (const c of state.customers) {
      const n = c.name.toLowerCase()
      const p = (c.phone || '').replace(/\D/g, '')
      if ((custNeedle.length >= 2 && n.includes(custNeedle)) || (custPhone.length >= 3 && p.includes(custPhone))) {
        push(c.name, c.phone)
      }
    }
    for (const o of state.orders) {
      const n = o.customerName.toLowerCase()
      const p = (o.customerPhone || '').replace(/\D/g, '')
      if ((custNeedle.length >= 2 && n.includes(custNeedle)) || (custPhone.length >= 3 && p.includes(custPhone))) {
        push(o.customerName, o.customerPhone)
      }
    }
    return out.slice(0, 8)
  }, [custNeedle, custPhone, state.customers, state.orders])

  const list = useMemo(() => {
    return state.orders
      .filter((o) => {
        if (isMozo && user && !mozoCanSeeOrder(o, user)) return false
        if (filter === 'por_cobrar') return isPendingPayment(o)
        if (filter === 'liquidar_caja') return needsCashierSettle(o)
        if (filter === 'historial') {
          if (!o.paid || o.status === 'cancelado') return false
          const t = new Date(o.updatedAt || o.createdAt).getTime()
          return t >= limaDayStart(cobroFrom).getTime() && t < limaDayEnd(cobroTo).getTime()
        }
        if (filter === 'delivery') {
          return isDeliveryOrder(o) && o.status !== 'cancelado' && o.status !== 'entregado'
        }
        if (filter === 'recojo') {
          return o.type === 'llevar' && o.status !== 'cancelado' && o.status !== 'entregado'
        }
        if (filter === 'todas') return true
        return o.status === filter
      })
      .filter((o) => {
        if (!custNeedle && custPhone.length < 3) return true
        const n = o.customerName.toLowerCase()
        const p = (o.customerPhone || '').replace(/\D/g, '')
        return (custNeedle.length >= 2 && n.includes(custNeedle)) || (custPhone.length >= 3 && p.includes(custPhone))
      })
      .sort((a, b) => {
        if (filter === 'delivery') {
          const ad = a.driverId ? 1 : 0
          const bd = b.driverId ? 1 : 0
          if (ad !== bd) return ad - bd
          const as = a.status === 'listo' ? 0 : 1
          const bs = b.status === 'listo' ? 0 : 1
          if (as !== bs) return as - bs
        }
        if (filter === 'todas') {
          const ap = isPendingPayment(a) ? 0 : 1
          const bp = isPendingPayment(b) ? 0 : 1
          if (ap !== bp) return ap - bp
        }
        return b.createdAt.localeCompare(a.createdAt)
      })
  }, [state.orders, filter, isMozo, user, custNeedle, custPhone, cobroFrom, cobroTo])

  const current = selected ? (state.orders.find((o) => o.id === selected.id) ?? null) : null

  useEffect(() => {
    setPickedDriverId(current?.driverId || '')
  }, [current?.id, current?.driverId])

  // Si el pedido ya no existe (borrado / liquidado / sync), cerrar modal
  useEffect(() => {
    if (!selected) return
    if (!state.orders.some((o) => o.id === selected.id)) setSelected(null)
  }, [state.orders, selected])

  // Mozo: cerrar solo si no es suyo ni delivery asignable
  useEffect(() => {
    if (!isMozo || !user || !selected) return
    if (!mozoCanSeeOrder(selected, user)) setSelected(null)
  }, [isMozo, user, selected])

  if (isMozo) return <Navigate to="/pedidos-web" replace />

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title={isCajero ? 'Caja' : isMozo ? 'Pedidos · mesa, llamada y delivery' : 'Ver pedidos'}
          hint={
            isMozo
              ? `Tomas pedidos. El cobro lo hace caja. Delivery: asigna repartidor (${needDriverCount} sin conductor).`
              : isCajero
                ? `Por cobrar (${pendingPayCount})${cashierSettleCount > 0 ? ` · Liquidar (${cashierSettleCount})` : ''}`
                : 'Toca uno para cobrar, cambiar estado o imprimir ticket.'
          }
        />
        {mayCharge ? <CajaCierre /> : null}
      </div>
      <div className="relative mt-4">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          className="min-h-12 w-full rounded-2xl border border-ink/10 bg-surface py-3 pr-4 pl-10 text-sm outline-none placeholder:text-ink/35 focus:border-gold focus:ring-2 focus:ring-gold/30"
          placeholder="Buscar cliente por nombre o celular…"
          value={custQ}
          onChange={(e) => {
            setCustQ(e.target.value)
            setCustOpen(true)
          }}
          onFocus={() => setCustOpen(true)}
          autoComplete="off"
        />
        {custOpen && custHits.length > 0 ? (
          <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-ink/10 bg-surface py-1 shadow-xl">
            {custHits.map((c) => (
              <li key={`${c.name}-${c.phone || ''}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gold/15"
                  onClick={() => {
                    setCustQ(c.name)
                    setCustOpen(false)
                  }}
                >
                  <span className="text-sm font-semibold">{c.name}</span>
                  <span className="text-xs text-ink/45">{c.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {(isCajero ? FILTERS_CAJA : isMozo ? FILTERS_FULL.filter((f) => f.id !== 'por_cobrar' && f.id !== 'liquidar_caja') : FILTERS_FULL).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-9 shrink-0 rounded-full px-4 py-1.5 text-sm ${
              filter === f.id ? 'bg-ink text-cream' : 'bg-surface text-ink/60 ring-1 ring-ink/8'
            }`}
          >
            {f.id === 'por_cobrar' && pendingPayCount > 0
              ? `${f.label} (${pendingPayCount})`
              : f.id === 'liquidar_caja' && cashierSettleCount > 0
                ? `${f.label} (${cashierSettleCount})`
                : f.id === 'delivery' && needDriverCount > 0
                  ? `${f.label} (${needDriverCount})`
                  : f.id === 'recojo' && recojoCount > 0
                    ? `${f.label} (${recojoCount})`
                    : f.label}
          </button>
        ))}
      </div>
      {filter === 'historial' ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-ink/50">
            Desde
            <input
              type="date"
              className="mt-1 block min-h-10 rounded-xl border border-ink/10 bg-surface px-3 text-sm text-ink"
              value={cobroFrom}
              onChange={(e) => setCobroFrom(e.target.value || todayYmd())}
            />
          </label>
          <label className="text-xs font-semibold text-ink/50">
            Hasta
            <input
              type="date"
              className="mt-1 block min-h-10 rounded-xl border border-ink/10 bg-surface px-3 text-sm text-ink"
              value={cobroTo}
              onChange={(e) => setCobroTo(e.target.value || todayYmd())}
            />
          </label>
        </div>
      ) : null}
      {list.length === 0 ? (
        <div className="mt-8">
          <Empty
            title={
              filter === 'por_cobrar'
                ? 'Nada por cobrar'
                : filter === 'historial'
                  ? 'Sin cobros en ese rango'
                  : filter === 'delivery'
                    ? 'No hay deliveries activos'
                    : filter === 'recojo'
                      ? 'No hay recojos activos'
                      : 'No hay comandas en este filtro'
            }
            hint={
              filter === 'por_cobrar'
                ? 'Cuando haya pedidos sin pagar aparecerán aquí.'
                : filter === 'historial'
                  ? 'Cambia las fechas para ver cobros de otros días.'
                  : filter === 'delivery'
                    ? 'Pedidos a domicilio (llamada, WSP, web). Aquí asignas repartidor.'
                    : filter === 'recojo'
                      ? 'Pedidos para recojo en tienda (llamada, WSP, web). Sin repartidor.'
                      : 'Crea uno desde Para llevar o Mesas.'
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-3 md:hidden">
            {list.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelected(o)}
                className="card card-press w-full p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl tracking-tight">{padOrder(o.number)}</p>
                    <p className="text-sm font-medium text-ink/55">{o.customerName}</p>
                    {o.tableNumber ? (
                      <p className="mt-0.5 font-display text-2xl text-ember">Mesa {o.tableNumber}</p>
                    ) : null}
                    <p className="text-xs text-ink/40">Mozo: {staffLabel(o, state.users)}</p>
                  </div>
                  <p className="font-extrabold text-ember">{soles(o.total)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={o.status} />
                  <TypeBadge type={o.type} />
                  {o.tableNumber ? (
                    <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-black text-[#1a3d1a]">
                      Mesa {o.tableNumber}
                    </span>
                  ) : null}
                  {isDeliveryOrder(o) && !o.driverId && o.status !== 'entregado' && o.status !== 'cancelado' ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                      Sin repartidor
                    </span>
                  ) : isDeliveryOrder(o) && o.driverId ? (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-900">
                      Con repartidor
                    </span>
                  ) : null}
                  {!o.paid && o.status !== 'cancelado' ? (
                    <span className="rounded-full bg-ember/15 px-2 py-0.5 text-[11px] font-bold text-ember">
                      {o.source === 'web' || o.type === 'delivery' ? 'Pend. liquidación' : 'Por cobrar'}
                    </span>
                  ) : null}
                  <span className="text-xs text-ink/35">{formatDateTime(o.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 hidden overflow-hidden rounded-[1.35rem] bg-white shadow-sm ring-1 ring-ink/[0.04] md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-wide text-ink/40 uppercase">
                <tr>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Hora</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className="cursor-pointer border-t border-ink/5 hover:bg-cream/80"
                  >
                    <td className="px-4 py-3 font-semibold">{padOrder(o.number)}</td>
                    <td className="px-4 py-3">
                      <p>{o.customerName}</p>
                      <p className="text-xs text-ink/40">{staffLabel(o, state.users)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TypeBadge type={o.type} />
                        {o.tableNumber ? (
                          <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-black text-[#1a3d1a]">
                            Mesa {o.tableNumber}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={o.status} />
                        {isDeliveryOrder(o) && !o.driverId && o.status !== 'entregado' && o.status !== 'cancelado' ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            Sin repartidor
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {o.paid ? (
                        <span className="capitalize text-ink/60">{o.paymentMethod}</span>
                      ) : (
                        <span className="font-semibold text-ember">
                          {o.source === 'web' || o.type === 'delivery'
                            ? `Pend. liquidación${o.codPaymentMethod ? ` · ${o.codPaymentMethod}` : ''}`
                            : 'Pendiente'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/50">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-medium">{soles(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={!!current}
        title={current ? `Comanda ${padOrder(current.number)}` : ''}
        onClose={() => setSelected(null)}
        wide
      >
        {current ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={current.status} />
              <TypeBadge type={current.type} />
              {current.tableNumber ? (
                <span className="rounded-full bg-gold px-2.5 py-0.5 text-sm font-black text-[#1a3d1a]">
                  Mesa {current.tableNumber}
                </span>
              ) : null}
            </div>
            <p className="text-sm font-semibold text-ink">Mozo: {staffLabel(current, state.users)}</p>
            <p className="text-sm text-ink/60">
              {current.customerName}
              {current.customerPhone ? ` · ${current.customerPhone}` : ''}
              {current.address ? ` · ${current.address}` : ''}
            </p>
            <ul className="divide-y divide-ink/5 rounded-xl bg-white">
              {current.items.map((i, idx) => (
                <li key={idx} className="flex justify-between px-3 py-2 text-sm">
                  <span>
                    {i.qty}× {i.name}
                    {i.notes ? <span className="block text-xs text-ember">{i.notes}</span> : null}
                  </span>
                  <span>{soles(i.qty * i.price)}</span>
                </li>
              ))}
            </ul>
            <div className="text-sm text-ink/50">
              <p className="font-display text-xl text-ink">Total {soles(current.total)}</p>
            </div>
            {current.notes ? <p className="text-sm">Nota: {current.notes}</p> : null}

            {(current.type === 'delivery' || current.type === 'web') &&
            current.address &&
            current.status !== 'cancelado' &&
            current.status !== 'entregado' ? (
              <div className="rounded-xl bg-teal-50 p-3">
                <p className="mb-1 text-xs font-semibold tracking-wide text-teal-800 uppercase">
                  1. Elige repartidor
                </p>
                <p className="mb-2 text-sm font-medium text-teal-950">
                  {current.driverId
                    ? `Asignado a ${current.driverName || 'repartidor'}. Puedes cambiarlo y tocar Asignar.`
                    : 'Toca un nombre y luego el botón Asignar.'}
                </p>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={assigning}
                    className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold ${
                      !pickedDriverId ? 'bg-ink text-cream' : 'bg-white text-ink'
                    }`}
                    onClick={() => setPickedDriverId('')}
                  >
                    Sin asignar
                  </button>
                  {drivers.map((d) => {
                    const on = pickedDriverId === d.id
                    return (
                      <button
                        key={d.id}
                        type="button"
                        disabled={assigning}
                        className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold ${
                          on ? 'bg-ink text-cream' : 'bg-white text-ink'
                        }`}
                        onClick={() => setPickedDriverId(d.id)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <img
                            src={
                              d.photoUrl ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=0f766e&color=ffffff&size=64`
                            }
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{d.name}</span>
                            <span className="block text-[11px] font-medium opacity-70">
                              {d.phone}
                              {d.plate || d.vehicleInfo ? ` · ${d.plate || d.vehicleInfo}` : ''}
                            </span>
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {(() => {
                  const dirty = (pickedDriverId || '') !== (current.driverId || '')
                  const picked = drivers.find((d) => d.id === pickedDriverId)
                  const assigned = current.driverId
                    ? drivers.find((d) => d.id === current.driverId)
                    : null
                  return (
                    <>
                      <button
                        type="button"
                        disabled={assigning || !dirty}
                        className="mt-3 min-h-11 w-full rounded-xl bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-40"
                        onClick={() => void assignDriver(current, pickedDriverId || null)}
                      >
                        {assigning
                          ? 'Asignando…'
                          : !dirty
                            ? picked
                              ? `Ya asignado a ${picked.name}`
                              : 'Elige un repartidor'
                            : picked
                              ? `Asignar a ${picked.name}`
                              : 'Quitar repartidor'}
                      </button>
                      <div className="mt-3 rounded-xl bg-white/80 p-3 text-sm text-teal-950">
                        <p className="text-xs font-bold tracking-wide text-teal-800 uppercase">
                          2. El repartidor entra así
                        </p>
                        <a
                          href={driverAppUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block font-bold text-teal-800 underline"
                        >
                          Abrir app repartidor
                        </a>
                        <p className="mt-1.5 text-xs leading-relaxed text-teal-900/80">
                          Celular del conductor
                          {assigned || picked
                            ? ` (${(assigned || picked)?.phone})`
                            : ''}
                          {' '}
                          + código por WhatsApp. Si no llega, usa <strong>123456</strong>.
                          No usa el login del sistema.
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : null}

            {current.paid ? <PrintOrderActions order={current} /> : null}

            {current.status !== 'cancelado' && current.status !== 'entregado' ? (
              <div className="flex flex-wrap gap-2">
                {current.status === 'nuevo' ? (
                  <button
                    className="min-h-11 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      updateOrderStatus(current.id, 'en_cocina')
                      setSelected(null)
                    }}
                  >
                    Pasar a cocina
                  </button>
                ) : null}
                {current.status === 'en_cocina' ? (
                  <button
                    className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      updateOrderStatus(current.id, 'listo')
                      setSelected(null)
                    }}
                  >
                    Marcar listo
                  </button>
                ) : null}
                {current.status === 'listo' ? (
                  current.type === 'delivery' || current.type === 'web' ? (
                    current.driverId ? (
                      <p className="w-full rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
                        Repartidor asignado. La entrega la confirma él en su app. En caja solo se cobra.
                      </p>
                    ) : (
                      <p className="w-full rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                        Asigna un repartidor arriba. Sin conductor no se puede marcar entregado.
                      </p>
                    )
                  ) : current.paid && !mayCharge ? (
                    <button
                      className="min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream"
                      onClick={() => {
                        updateOrderStatus(current.id, 'entregado')
                        setSelected(null)
                      }}
                    >
                      {current.type === 'salon' || current.tableNumber
                        ? `Liberar mesa${current.tableNumber ? ` ${current.tableNumber}` : ''}`
                        : 'Entregar recojo'}
                    </button>
                  ) : null
                ) : null}
              </div>
            ) : null}
            {!mayCharge && !current.paid && current.status !== 'cancelado' ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                Por cobrar · solo caja confirma el pago.
              </p>
            ) : null}
            {mayCharge && !current.paid && current.status !== 'cancelado' ? (
              <CajaCobro
                order={current}
                busy={paying}
                onConfirm={async (payload) => {
                  setPaying(true)
                  try {
                    await payOrder(current.id, payload)
                    if (current.type === 'salon' || current.type === 'llevar' || current.tableNumber) {
                      updateOrderStatus(current.id, 'entregado')
                    }
                    const paidOrder = {
                      ...current,
                      paid: true,
                      paymentMethod: payload.payments[0]?.method ?? 'efectivo',
                      docTipo: payload.billing.docTipo,
                      docNumero: payload.billing.docNumero,
                      docNombre: payload.billing.docNombre,
                      docEmail: payload.billing.docEmail,
                      docPhone: payload.billing.docPhone,
                      docAddress: payload.billing.docAddress,
                    }
                    printTicket(paidOrder, state.settings, 'caja', state.users)
                  } finally {
                    setPaying(false)
                  }
                }}
                onFinished={() => setSelected(null)}
              />
            ) : null}
            {mayCharge && needsCashierSettle(current) ? (
              <div className="rounded-xl bg-teal-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-teal-700">Liquidar en caja</p>
                <p className="mb-3 text-sm text-teal-900">
                  Pedido web ya pagado online y entregado. Confirma la liquidación.
                </p>
                <button
                  className="min-h-10 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => setSettleDlg('confirm')}
                >
                  Confirmar liquidación
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
      <ConfirmProcess
        open={!!settleDlg}
        phase={settleDlg === 'done' ? 'done' : settleDlg === 'busy' ? 'busy' : 'confirm'}
        title="¿Liquidar en caja?"
        message={<p>Confirmas que este pedido web ya está cobrado y entregado.</p>}
        confirmLabel="Sí, liquidar"
        doneTitle="Liquidación procesada"
        doneMessage="El pedido quedó liquidado en caja."
        busyLabel="Liquidando…"
        onConfirm={() => {
          if (!current) return
          setSettleDlg('busy')
          void apiSettleCashier(current.id)
            .then(() => {
              reloadFromApi()
              setSettleDlg('done')
            })
            .catch(() => setSettleDlg('confirm'))
        }}
        onCancel={() => setSettleDlg(null)}
        onDone={() => {
          setSettleDlg(null)
          setSelected(null)
        }}
      />
    </div>
  )
}
