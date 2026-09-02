import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, CalendarRange, MapPin, Search, ShoppingBag, Table2, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { formatDateTime, padOrder, soles } from '../lib/format'
import { filterKitchenItems } from '../lib/kitchen'
import { staffLabel } from '../lib/staffLabel'
import {
  channelOf,
  inDayRange,
  isClosedForMozo,
  mozoSeesActive,
  mozoSeesHistory,
  todayYmd,
  type OrderChannel,
} from '../lib/mozoOrders'
import { isDeliveryOrder } from '../lib/orderType'
import { apiAssignDriver, apiListDrivers } from '../lib/apiClient'
import { PageTitle, StatusBadge, inputClass } from '../components/ui'
import { PrintOrderActions } from '../components/PrintOrderActions'
import { NuevoPedidoButton } from '../components/NuevoPedido'
import type { Driver, Order } from '../types'

type Channel = 'todas' | OrderChannel

function ChannelBadge({ order }: { order: Order }) {
  const ch = channelOf(order)
  if (ch === 'mesa') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[11px] font-black text-[#1a3d1a]">
        <Table2 size={12} strokeWidth={2.4} />
        Mesa {order.tableNumber ?? '—'}
      </span>
    )
  }
  if (ch === 'recojo') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-ink ring-1 ring-ink/10">
        <ShoppingBag size={12} />
        Recojo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-800 dark:text-sky-300">
      <MapPin size={12} />
      Delivery
    </span>
  )
}

function matchesQuery(o: Order, needle: string, phoneNeedle: string) {
  if (!needle && phoneNeedle.length < 3) return true
  const n = o.customerName.toLowerCase()
  const p = (o.customerPhone || '').replace(/\D/g, '')
  return (needle.length >= 2 && n.includes(needle)) || (phoneNeedle.length >= 3 && p.includes(phoneNeedle))
}

export function PedidosWeb({ vista = 'curso' }: { vista?: 'curso' | 'historial' }) {
  const { state, updateOrderStatus, reloadFromApi, live } = useStore()
  const { user, actingRole } = useAuth()
  const navigate = useNavigate()
  const isMozo = actingRole === 'mozo'
  const board = vista
  const [channel, setChannel] = useState<Channel>('todas')
  const [q, setQ] = useState('')
  const [qOpen, setQOpen] = useState(false)
  const [from, setFrom] = useState(todayYmd)
  const [to, setTo] = useState(todayYmd)
  const [now, setNow] = useState(() => Date.now())
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    void apiListDrivers()
      .then((r) => setDrivers((r.drivers || []).filter((d) => d.active)))
      .catch(() => setDrivers([]))
  }, [])

  const mine = useMemo(() => {
    const sorted = [...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (!isMozo) return sorted
    return sorted
  }, [state.orders, isMozo])

  const activePool = useMemo(() => {
    return mine.filter((o) => (isMozo ? mozoSeesActive(o, user) : !isClosedForMozo(o)))
  }, [mine, isMozo, user])

  const historyPool = useMemo(() => {
    const closed = mine.filter((o) => (isMozo ? mozoSeesHistory(o, user) : isClosedForMozo(o)))
    return closed.filter((o) => inDayRange(o.createdAt, from, to))
  }, [mine, isMozo, user, from, to])

  const pool = board === 'curso' ? activePool : historyPool

  const counts = useMemo(() => {
    const src = board === 'historial' ? historyPool : activePool
    return {
      todas: src.length,
      mesa: src.filter((o) => channelOf(o) === 'mesa').length,
      recojo: src.filter((o) => channelOf(o) === 'recojo').length,
      delivery: src.filter((o) => channelOf(o) === 'delivery').length,
    }
  }, [activePool, historyPool, board])

  const needle = q.trim().toLowerCase()
  const phoneNeedle = q.replace(/\D/g, '')
  const matches = useMemo(() => {
    if (needle.length < 2 && phoneNeedle.length < 3) return []
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
      if ((needle.length >= 2 && n.includes(needle)) || (phoneNeedle.length >= 3 && p.includes(phoneNeedle))) {
        push(c.name, c.phone)
      }
    }
    for (const o of pool) {
      if (matchesQuery(o, needle, phoneNeedle)) push(o.customerName, o.customerPhone)
    }
    return out.slice(0, 8)
  }, [needle, phoneNeedle, state.customers, pool])

  const list = useMemo(() => {
    return pool.filter((o) => {
      if (channel !== 'todas' && channelOf(o) !== channel) return false
      return matchesQuery(o, needle, phoneNeedle)
    })
  }, [pool, channel, needle, phoneNeedle])

  const acceptKitchen = (o: Order) => {
    const kitchen = filterKitchenItems(o.items, state.products)
    updateOrderStatus(o.id, kitchen.length > 0 ? 'en_cocina' : 'listo')
  }

  const assignDriver = async (order: Order, driverId: string) => {
    if (assigning) return
    setAssigning(order.id)
    try {
      await apiAssignDriver(order.id, driverId || null)
      await reloadFromApi()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          kicker={live ? 'En vivo' : board === 'historial' ? 'Cerrados' : 'En curso'}
          title={board === 'historial' ? 'Historial' : isMozo ? 'Pedidos' : 'Pedidos'}
          hint={
            board === 'historial'
              ? isMozo
                ? 'Tus pedidos pagados (local) o liquidados (delivery), por rango de fecha.'
                : 'Pedidos pagados o liquidados, por rango de fecha.'
              : isMozo
                ? 'Mesa, recojo y delivery. El cobro lo hace caja. Lo cerrado pasa a Historial.'
                : 'Mesa, recojo o delivery. Un solo tablero.'
          }
        />
        {board === 'curso' ? <NuevoPedidoButton /> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ['todas', 'Todos', counts.todas],
            ['mesa', 'En mesa', counts.mesa],
            ['recojo', 'Recojo', counts.recojo],
            ['delivery', 'Delivery', counts.delivery],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => setChannel(id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-bold ring-1 transition ${
              channel === id
                ? 'bg-[#1a3d1a] text-gold ring-[#1a3d1a]'
                : 'bg-surface text-ink ring-ink/12 hover:ring-gold/60'
            }`}
          >
            {label}
            <span className={channel === id ? 'text-gold/80' : 'text-ink/40'}>{n}</span>
          </button>
        ))}
      </div>

      {board === 'historial' ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-surface p-3 ring-1 ring-ink/8">
          <CalendarRange size={18} className="mb-2 text-ink/35" />
          <label className="min-w-[9rem] flex-1">
            <span className="mb-1 block text-[10px] font-bold tracking-wide text-ink/40 uppercase">Desde</span>
            <input type="date" className={inputClass} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="min-w-[9rem] flex-1">
            <span className="mb-1 block text-[10px] font-bold tracking-wide text-ink/40 uppercase">Hasta</span>
            <input type="date" className={inputClass} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      ) : null}

      <div className="relative mt-4">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          className="min-h-12 w-full rounded-2xl border border-ink/10 bg-surface py-3 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-gold focus:ring-2 focus:ring-gold/30"
          placeholder="Buscar cliente por nombre o celular…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setQOpen(true)
          }}
          onFocus={() => setQOpen(true)}
          autoComplete="off"
        />
        {qOpen && matches.length > 0 ? (
          <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-ink/10 bg-surface py-1 shadow-xl">
            {matches.map((c) => (
              <li key={`${c.name}-${c.phone || ''}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gold/15"
                  onClick={() => {
                    setQ(c.name)
                    setQOpen(false)
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

      <div className="mt-6 space-y-3">
        {list.length === 0 ? (
          <p className="text-sm text-ink/40">
            {board === 'historial'
              ? 'No hay pedidos cerrados en ese rango.'
              : 'Nada en curso. Los pagados (local) o liquidados (delivery) van al historial.'}
          </p>
        ) : null}
        {list.map((o, idx) => {
          const mesa = channelOf(o) === 'mesa'
          const mins = Math.max(
            0,
            Math.floor((now - new Date(o.updatedAt || o.createdAt).getTime()) / 60000),
          )
          const late = board === 'curso' && mins >= 15 && o.status !== 'listo' && o.status !== 'entregado'
          const origin = o.source === 'web' ? 'App del cliente' : `Mozo: ${staffLabel(o, state.users)}`
          return (
            <article
              key={o.id}
              className={`order-card-in card overflow-hidden p-4 ${mesa ? 'ring-1 ring-gold/50' : ''} ${
                o.status === 'nuevo' && board === 'curso' ? 'ring-1 ring-ember/40' : ''
              } ${late ? 'ring-2 ring-ember' : ''}`}
              style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-xl">{padOrder(o.number)}</p>
                    <ChannelBadge order={o} />
                    {o.source === 'web' ? (
                      <span className="rounded-full bg-ink/8 px-2 py-0.5 text-[10px] font-bold text-ink/50">APP</span>
                    ) : (
                      <span className="rounded-full bg-ink/8 px-2 py-0.5 text-[10px] font-bold text-ink/50">POS</span>
                    )}
                  </div>
                  {mesa ? (
                    <p className="mt-1 font-display text-3xl tracking-tight text-ember">Mesa {o.tableNumber}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold text-ink">{o.customerName}</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink/45">{origin}</p>
                  <p className="break-all text-sm text-ink/50">
                    {o.customerPhone}
                    {o.address ? ` · ${o.address}` : ''}
                  </p>
                  <p className="text-xs text-ink/40">{formatDateTime(o.createdAt)}</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={o.status} />
                  {board === 'curso' ? (
                    <p className={`mt-2 text-xs font-black tabular-nums ${late ? 'text-ember' : 'text-ink/40'}`}>
                      {mins} min
                    </p>
                  ) : null}
                  <p className="mt-1 font-black text-ember">{soles(o.total)}</p>
                  {o.paid ? (
                    <p className="text-[11px] font-bold text-emerald-700 uppercase">Pagado</p>
                  ) : o.codPaymentMethod ? (
                    <p className="text-[11px] font-bold text-ink/45 uppercase">{o.codPaymentMethod}</p>
                  ) : (
                    <p className="text-[11px] font-bold text-ember uppercase">Por cobrar</p>
                  )}
                  {isDeliveryOrder(o) && o.driverSettledAt ? (
                    <p className="text-[11px] font-bold text-teal-700 uppercase">Liquidado</p>
                  ) : null}
                </div>
              </div>
              <ul className="mt-3 text-sm text-ink/70">
                {o.items.map((i, iidx) => {
                  const kitchen = filterKitchenItems([i], state.products).length > 0
                  return (
                    <li key={iidx} className="flex flex-wrap items-center gap-2">
                      <span>
                        {i.qty}× {i.name}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          kitchen
                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                            : 'bg-sky-500/15 text-sky-800 dark:text-sky-200'
                        }`}
                      >
                        {kitchen ? 'cocina' : 'barra'}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {board === 'curso' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {o.status === 'nuevo' ? (
                    <button
                      className="min-h-10 rounded-xl bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white"
                      onClick={() => acceptKitchen(o)}
                    >
                      Aceptar
                    </button>
                  ) : null}
                  {mesa && o.status === 'listo' ? (
                    <button
                      className="min-h-10 rounded-xl bg-[#1a3d1a] px-3 py-1.5 text-sm font-bold text-gold"
                      onClick={() => updateOrderStatus(o.id, 'entregado')}
                    >
                      Entregado en mesa
                    </button>
                  ) : null}
                  {mesa ? (
                    <button
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-gold px-3 py-1.5 text-sm font-bold text-[#1a3d1a]"
                      onClick={() => navigate(o.tableId ? `/pos?mesa=${o.tableId}&agregar=${o.id}` : '/mesas')}
                    >
                      <UtensilsCrossed size={14} />
                      Pedir más
                    </button>
                  ) : null}
                  {isDeliveryOrder(o) && o.status !== 'entregado' && o.status !== 'cancelado' ? (
                    <label className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-teal-50 px-2 text-xs font-bold text-teal-900 ring-1 ring-teal-200">
                      <Bike size={14} />
                      <select
                        className="bg-transparent py-2 pr-1 outline-none"
                        disabled={assigning === o.id}
                        value={o.driverId || ''}
                        onChange={(e) => void assignDriver(o, e.target.value)}
                      >
                        <option value="">Sin repartidor</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="ml-auto">
                    <PrintOrderActions order={o} />
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex justify-end">
                  <PrintOrderActions order={o} />
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
