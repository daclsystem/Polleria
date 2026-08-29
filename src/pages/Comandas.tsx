import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { useAuth } from '../auth/AuthContext'
import { formatDateTime, padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { filterKitchenItems } from '../lib/kitchen'
import { orderBelongsToStaff } from '../lib/realtime'
import { apiAssignDriver, apiListDrivers, apiSettleCashier } from '../lib/apiClient'
import { isDeliveryOrder, needsDriver } from '../lib/orderType'
import type { Driver, Order, OrderStatus, PaymentMethod } from '../types'
import { Empty, Modal, PageTitle, StatusBadge, TypeBadge, inputClass } from '../components/ui'

type ComandaFilter = 'por_cobrar' | 'liquidar_caja' | 'todas' | 'delivery' | 'recojo' | OrderStatus

const FILTERS_FULL: { id: ComandaFilter; label: string }[] = [
  { id: 'por_cobrar', label: 'Por cobrar' },
  { id: 'liquidar_caja', label: 'Liquidar' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'recojo', label: 'Recojo' },
  { id: 'todas', label: 'Todas' },
  { id: 'nuevo', label: 'Nuevas' },
  { id: 'en_cocina', label: 'Cocina' },
  { id: 'listo', label: 'Listas' },
  { id: 'entregado', label: 'Entregadas' },
  { id: 'cancelado', label: 'Canceladas' },
]

/** Cajero solo ve: Por cobrar y Liquidar */
const FILTERS_CAJA: { id: ComandaFilter; label: string }[] = [
  { id: 'por_cobrar', label: 'Por cobrar' },
  { id: 'liquidar_caja', label: 'Liquidar' },
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

function isPendingPayment(o: Order) {
  return !o.paid && o.status !== 'cancelado'
}

/** Mozo: sus mesas + delivery activos (asignar repartidor) + recojos activos. */
function mozoCanSeeOrder(o: Order, user: { id?: string; name?: string }) {
  if (orderBelongsToStaff(o, user)) return true
  if (isDeliveryOrder(o) && o.status !== 'cancelado' && o.status !== 'entregado') return true
  if (o.type === 'llevar' && o.status !== 'cancelado' && o.status !== 'entregado') return true
  return false
}

export function Comandas() {
  const { state, updateOrderStatus, payOrder, cancelOrder, reloadFromApi } = useStore()
  const { user } = useAuth()
  const isMozo = user?.role === 'mozo'
  const isCajero = user?.role === 'cajero'
  const [filter, setFilter] = useState<ComandaFilter>(isCajero ? 'por_cobrar' : isMozo ? 'delivery' : 'todas')
  const [selected, setSelected] = useState<Order | null>(null)
  const [pay, setPay] = useState<PaymentMethod>('efectivo')
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [assigning, setAssigning] = useState(false)

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
    if (isMozo) setFilter('delivery')
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

  const list = useMemo(() => {
    return state.orders
      .filter((o) => {
        if (isMozo && user && !mozoCanSeeOrder(o, user)) return false
        if (filter === 'por_cobrar') return isPendingPayment(o)
        if (filter === 'liquidar_caja') return needsCashierSettle(o)
        if (filter === 'delivery') {
          return isDeliveryOrder(o) && o.status !== 'cancelado' && o.status !== 'entregado'
        }
        if (filter === 'recojo') {
          return o.type === 'llevar' && o.status !== 'cancelado' && o.status !== 'entregado'
        }
        if (filter === 'todas') return true
        return o.status === filter
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
  }, [state.orders, filter, isMozo, user])

  const current = selected ? (state.orders.find((o) => o.id === selected.id) ?? null) : null

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

  return (
    <div>
      <PageTitle
        title={isCajero ? 'Caja' : isMozo ? 'Pedidos · mesa, llamada y delivery' : 'Ver pedidos'}
        hint={
          isMozo
            ? `Mesas + pedidos por llamada/WSP/web. Delivery: asigna repartidor (${needDriverCount} sin conductor).`
            : isCajero
              ? `Por cobrar (${pendingPayCount})${cashierSettleCount > 0 ? ` · Liquidar (${cashierSettleCount})` : ''}`
              : 'Toca uno para cobrar, cambiar estado o imprimir ticket.'
        }
      />
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {(isCajero ? FILTERS_CAJA : FILTERS_FULL).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-9 shrink-0 rounded-full px-4 py-1.5 text-sm ${
              filter === f.id ? 'bg-ink text-cream' : 'bg-white text-ink/60'
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
      {list.length === 0 ? (
        <div className="mt-8">
          <Empty
            title={
              filter === 'por_cobrar'
                ? 'Nada por cobrar'
                : filter === 'delivery'
                  ? 'No hay deliveries activos'
                  : filter === 'recojo'
                    ? 'No hay recojos activos'
                    : 'No hay comandas en este filtro'
            }
            hint={
              filter === 'por_cobrar'
                ? 'Cuando haya pedidos sin pagar aparecerán aquí.'
                : filter === 'delivery'
                  ? 'Pedidos a domicilio (llamada, WSP, web). Aquí asignas repartidor.'
                  : filter === 'recojo'
                    ? 'Pedidos para recojo en tienda (llamada, WSP, web). Sin repartidor.'
                    : 'Crea uno desde Tomar pedido o la carta web.'
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
                  </div>
                  <p className="font-extrabold text-ember">{soles(o.total)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={o.status} />
                  <TypeBadge type={o.type} />
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
                      <p className="text-xs text-ink/40">{o.createdBy}</p>
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={o.type} />
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
            </div>
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
              <p>Subtotal (sin IGV): {soles(current.subtotal)}</p>
              <p>IGV: {soles(current.igv)}</p>
              <p className="font-display text-xl text-ink">Total {soles(current.total)}</p>
            </div>
            {current.notes ? <p className="text-sm">Nota: {current.notes}</p> : null}

            {(current.type === 'delivery' || current.type === 'web') &&
            current.address &&
            current.status !== 'cancelado' &&
            current.status !== 'entregado' ? (
              <div className="rounded-xl bg-teal-50 p-3">
                <p className="mb-2 text-xs font-semibold tracking-wide text-teal-800 uppercase">
                  {isMozo ? 'Asignar repartidor' : 'Conductor (delivery)'}
                </p>
                <select
                  className={inputClass}
                  disabled={assigning}
                  value={current.driverId || ''}
                  onChange={async (e) => {
                    const driverId = e.target.value || null
                    setAssigning(true)
                    try {
                      await apiAssignDriver(current.id, driverId)
                      setSelected({
                        ...current,
                        driverId: driverId || undefined,
                        driverName: driverId
                          ? drivers.find((d) => d.id === driverId)?.name
                          : undefined,
                      })
                      await reloadFromApi()
                    } catch (err) {
                      alert((err as Error).message)
                    } finally {
                      setAssigning(false)
                    }
                  }}
                >
                  <option value="">Sin asignar — elige repartidor</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.phone}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-teal-800/70">
                  {isMozo
                    ? 'Cuando esté listo, el repartidor lo lleva y marca entregado en /conductor.'
                    : 'App conductor: /conductor — toma pedidos listos y abre la ruta en Maps.'}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold"
                onClick={() => printTicket(current, state.settings, 'caja')}
              >
                <Printer size={16} /> Ticket caja
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold"
                onClick={() => {
                  const kitchen = filterKitchenItems(current.items, state.products)
                  if (kitchen.length === 0) {
                    alert('Este pedido no tiene ítems de preparación (solo barra).')
                    return
                  }
                  printTicket(
                    {
                      ...current,
                      items: kitchen,
                      notes:
                        current.source === 'web'
                          ? `WEB / APP · ${current.notes || ''}`.trim()
                          : current.notes,
                    },
                    state.settings,
                    'cocina',
                  )
                }}
              >
                <Printer size={16} /> Comanda cocina
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold"
                onClick={() => printTicket(current, state.settings, 'cuenta')}
              >
                <Printer size={16} /> Pre-cuenta
              </button>
            </div>

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
                        Repartidor asignado. La entrega la confirma el conductor en su app (/conductor).
                        En caja solo liquida el cobro.
                      </p>
                    ) : (
                      <p className="w-full rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                        Asigna un repartidor arriba. Sin conductor no se puede marcar entregado.
                      </p>
                    )
                  ) : (
                    <button
                      className="min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream"
                      onClick={() => {
                        updateOrderStatus(current.id, 'entregado')
                        setSelected(null)
                      }}
                    >
                      Entregar
                    </button>
                  )
                ) : null}
                <button
                  className="min-h-11 rounded-xl bg-brick px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    cancelOrder(current.id)
                    setSelected(null)
                  }}
                >
                  Cancelar
                </button>
              </div>
            ) : null}
            {!current.paid && current.status !== 'cancelado' ? (
              <div className="rounded-xl bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-ink/40">Cobrar</p>
                <div className="flex flex-wrap gap-2">
                  {(['efectivo', 'yape', 'tarjeta'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPay(m)}
                      className={`min-h-10 rounded-lg px-3 py-1 text-sm capitalize ${pay === m ? 'bg-ink text-cream' : 'bg-cream'}`}
                    >
                      {m}
                    </button>
                  ))}
                  <button
                    className="min-h-10 rounded-lg bg-ember px-3 py-1 text-sm font-semibold text-white sm:ml-auto"
                    onClick={() => {
                      payOrder(current.id, pay)
                      printTicket({ ...current, paid: true, paymentMethod: pay }, state.settings, 'caja')
                      setSelected(null)
                    }}
                  >
                    Confirmar e imprimir
                  </button>
                </div>
              </div>
            ) : null}
            {needsCashierSettle(current) ? (
              <div className="rounded-xl bg-teal-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-teal-700">Liquidar en caja</p>
                <p className="mb-3 text-sm text-teal-900">
                  Pedido web ya pagado online y entregado. Confirma la liquidación.
                </p>
                <button
                  className="min-h-10 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
                  onClick={async () => {
                    await apiSettleCashier(current.id)
                    reloadFromApi()
                    setSelected(null)
                  }}
                >
                  Confirmar liquidación
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
