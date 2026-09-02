import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bike, ChevronLeft, ChevronRight, Clock, Volume2 } from 'lucide-react'
import { elapsedMinutes, padOrder } from '../lib/format'
import { playSound, unlockSounds } from '../lib/sounds'
import {
  filterKitchenItems,
  filterKitchenWave,
  type KitchenWave,
} from '../lib/kitchen'
import { staffLabel } from '../lib/staffLabel'
import { useStore } from '../store/StoreContext'
import type { Order, OrderStatus } from '../types'
import { PageTitle } from '../components/ui'
import { CocinaPerdida } from '../components/CocinaPerdida'

const COLS: { id: KitchenWave; title: string; hint: string; advanceTo: OrderStatus }[] = [
  { id: 'pendiente', title: 'Recibidos', hint: 'Nuevos y adicionales', advanceTo: 'en_cocina' },
  { id: 'en_cocina', title: 'En fuego', hint: 'Preparando', advanceTo: 'listo' },
  { id: 'listo', title: 'Listos', hint: 'Para entregar / repartir', advanceTo: 'entregado' },
]

type KitchenTicket = {
  key: string
  order: Order
  wave: KitchenWave
  items: Order['items']
  isAdditional: boolean
}

function typeBadge(order: Order) {
  if (order.type === 'delivery' || order.type === 'web') {
    return { label: 'Delivery', className: 'bg-teal-600 text-white' }
  }
  if (order.type === 'llevar') {
    return { label: 'Recojo', className: 'bg-amber-500 text-white' }
  }
  return { label: order.tableNumber ? `Mesa ${order.tableNumber}` : 'Salón', className: 'bg-ink/80 text-cream' }
}

export function Cocina() {
  const { state, updateOrderStatus } = useStore()
  const products = state.products

  const tickets = useMemo(() => {
    const list: KitchenTicket[] = []
    for (const o of state.orders) {
      if (o.status === 'entregado' || o.status === 'cancelado') continue
      const kitchenAll = filterKitchenItems(o.items, products)
      if (kitchenAll.length === 0) continue

      const pendiente = filterKitchenWave(o.items, products, 'pendiente')
      const enFuego = filterKitchenWave(o.items, products, 'en_cocina')
      const listos = filterKitchenWave(o.items, products, 'listo')

      if (pendiente.length) {
        list.push({
          key: `${o.id}:pendiente`,
          order: o,
          wave: 'pendiente',
          items: pendiente,
          isAdditional: enFuego.length > 0 || listos.length > 0,
        })
      }
      if (enFuego.length) {
        list.push({
          key: `${o.id}:en_cocina`,
          order: o,
          wave: 'en_cocina',
          items: enFuego,
          isAdditional: false,
        })
      }
      // Delivery con repartidor asignado: sale de cocina, lo lleva el repartidor
      const isDeliveryWithDriver =
        (o.type === 'delivery' || o.type === 'web') && Boolean(o.driverId)
      if (listos.length && !isDeliveryWithDriver) {
        list.push({
          key: `${o.id}:listo`,
          order: o,
          wave: 'listo',
          items: listos,
          isAdditional: false,
        })
      }
    }
    return list
  }, [state.orders, products])

  const knownPendientes = useRef<Set<string>>(new Set())
  const primed = useRef(false)
  const [soundOn, setSoundOn] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const ids = new Set(tickets.filter((t) => t.wave === 'pendiente').map((t) => t.key))
    if (!primed.current) {
      knownPendientes.current = ids
      primed.current = true
      return
    }
    for (const id of ids) {
      if (!knownPendientes.current.has(id)) {
        playSound('nuevo')
        break
      }
    }
    knownPendientes.current = ids
  }, [tickets])

  const enableSound = () => {
    unlockSounds()
    setSoundOn(true)
  }

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] flex-col gap-3 overflow-hidden sm:h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <PageTitle title="Pantalla de cocina" hint={`${tickets.length} tickets activos`} />
        <div className="flex items-center gap-2">
          <CocinaPerdida />
          {!soundOn ? (
            <button
              type="button"
              onClick={enableSound}
              className="flex min-h-10 items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white"
            >
              <Volume2 size={16} /> Activar sonido
            </button>
          ) : (
            <span className="rounded-full bg-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60">Sonido ON</span>
          )}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 font-display text-lg text-gold tabular-nums sm:text-xl">
            <Clock size={14} className="opacity-70" />
            {now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
      <p className="shrink-0 text-[11px] font-medium text-ink/45">Desliza o usa las flechas para ver Recibidos · En fuego · Listos</p>

      <KitchenBoard>
        {COLS.map((col) => {
          const colTickets = tickets
            .filter((t) => t.wave === col.id)
            .sort((a, b) => a.order.updatedAt.localeCompare(b.order.updatedAt))
          return (
            <section
              key={col.id}
              className="card flex h-full w-[min(85vw,20rem)] shrink-0 snap-start flex-col overflow-hidden sm:w-[22rem]"
            >
              <div className="shrink-0 border-b border-ink/10 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl text-ember sm:text-2xl">{col.title}</h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                      colTickets.length > 0 ? 'bg-ember text-white' : 'bg-ink/10 text-ink/40'
                    }`}
                  >
                    {colTickets.length}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-ink/45">
                  {col.id === 'pendiente'
                    ? 'Nuevos; si la mesa ya cocina, sale como adicional'
                    : col.hint}
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-cream/50 p-3 [-webkit-overflow-scrolling:touch]">
                {colTickets.map((t) => (
                  <KitchenCard
                    key={t.key}
                    order={t.order}
                    kitchenItems={t.items}
                    wave={t.wave}
                    isAdditional={t.isAdditional}
                    onAdvance={() => {
                      // Delivery: cocina no marca “entregado”; eso lo hace el repartidor
                      if (
                        col.advanceTo === 'entregado' &&
                        (t.order.type === 'delivery' || t.order.type === 'web')
                      ) {
                        return
                      }
                      if (col.advanceTo === 'listo') playSound('listo')
                      updateOrderStatus(t.order.id, col.advanceTo, t.wave === 'listo' ? undefined : t.wave)
                    }}
                    hideAdvance={
                      col.id === 'listo' &&
                      (t.order.type === 'delivery' || t.order.type === 'web')
                    }
                  />
                ))}
                {colTickets.length === 0 ? (
                  <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-ink/12 px-4 py-8 text-center">
                    <p className="text-sm text-ink/30">Vacío</p>
                  </div>
                ) : null}
              </div>
            </section>
          )
        })}
      </KitchenBoard>
    </div>
  )
}

function KitchenBoard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; left: number } | null>(null)

  const scrollBy = (dir: number) => {
    const el = ref.current
    if (!el) return
    const step = Math.min(el.clientWidth * 0.85, 360)
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  return (
    <div className="relative min-h-0 min-w-0 w-full flex-1">
      <div
        ref={ref}
        className="flex h-full min-h-0 min-w-0 gap-3 overflow-x-auto overflow-y-hidden pb-2 [scrollbar-width:thin] snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button, a, input, textarea')) return
          const el = ref.current
          if (!el) return
          drag.current = { x: e.clientX, left: el.scrollLeft }
          el.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const el = ref.current
          const d = drag.current
          if (!el || !d) return
          el.scrollLeft = d.left - (e.clientX - d.x)
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Columna anterior"
        onClick={() => scrollBy(-1)}
        className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink shadow ring-1 ring-black/10 lg:hidden"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        aria-label="Columna siguiente"
        onClick={() => scrollBy(1)}
        className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink shadow ring-1 ring-black/10 lg:hidden"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  )
}

function KitchenCard({
  order,
  kitchenItems,
  wave,
  isAdditional,
  onAdvance,
  hideAdvance,
}: {
  order: Order
  kitchenItems: Order['items']
  wave: KitchenWave
  isAdditional: boolean
  onAdvance: () => void
  hideAdvance?: boolean
}) {
  const { state } = useStore()
  const mins = elapsedMinutes(order.updatedAt || order.createdAt)
  const late = mins >= 15 && wave !== 'listo'
  const isDelivery = order.type === 'delivery' || order.type === 'web'
  const btn =
    wave === 'pendiente'
      ? 'Empezar'
      : wave === 'en_cocina'
        ? 'Marcar listo'
        : isDelivery
          ? 'Listo p/ repartir'
          : 'Entregar'
  const badge = typeBadge(order)
  const who =
    isDelivery
      ? order.customerName || 'Cliente'
      : order.tableNumber
        ? `Mesa ${order.tableNumber}`
        : order.customerName || 'Cliente'

  return (
    <article
      className={`card rounded-xl p-3.5 text-ink ${late ? 'ring-2 ring-ember' : ''} ${isAdditional ? 'ring-2 ring-amber-400' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-display text-xl leading-none sm:text-2xl">{padOrder(order.number)}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>
              {badge.label}
            </span>
            {order.source === 'web' ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">APP</span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-ink/55">
            {who}
            {' · '}
            {staffLabel(order, state.users)}
            {isDelivery && order.driverId ? (
              <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-teal-700">
                · <Bike size={11} /> asignado
              </span>
            ) : null}
          </p>
          {isAdditional ? (
            <p className="mt-1 text-[11px] font-bold tracking-wide text-amber-700 uppercase">Adicional · lo nuevo</p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${late ? 'bg-ember text-white' : 'bg-ink/10'}`}>
          {mins} min
        </span>
      </div>
      <ul className="mt-2.5 space-y-1">
        {kitchenItems.map((i, idx) => (
          <li key={i.id || idx} className="text-sm leading-snug">
            <span className="font-bold">{i.qty}×</span> {i.name}
            {i.notes ? <span className="block text-xs text-ember">{i.notes}</span> : null}
          </li>
        ))}
      </ul>
      {order.notes && !isAdditional ? <p className="mt-2 text-xs italic text-ink/50">{order.notes}</p> : null}
      {isAdditional ? (
        <p className="mt-2 text-[11px] text-amber-800/80">
          Esta mesa ya tiene platos en fuego. Solo prepara lo de esta tarjeta.
        </p>
      ) : null}
      <div className="mt-3">
        {hideAdvance ? (
          <p className="flex min-h-11 items-center rounded-xl bg-white/90 px-3 text-xs font-semibold text-ink/70 ring-1 ring-ink/10">
            {order.driverId ? 'Listo · con repartidor' : 'Listo · asigna repartidor en Caja'}
          </p>
        ) : (
          <button onClick={onAdvance} className="min-h-11 w-full rounded-xl bg-ember py-2 text-sm font-semibold text-white">
            {btn}
          </button>
        )}
      </div>
    </article>
  )
}
