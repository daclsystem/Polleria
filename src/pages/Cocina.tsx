import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Volume2 } from 'lucide-react'
import { elapsedMinutes, padOrder } from '../lib/format'
import { printTicket } from '../lib/print'
import { playSound, unlockSounds } from '../lib/sounds'
import {
  filterKitchenItems,
  filterKitchenWave,
  type KitchenWave,
} from '../lib/kitchen'
import { useStore } from '../store/StoreContext'
import type { Order, OrderStatus } from '../types'
import { PageTitle } from '../components/ui'

const COLS: { id: KitchenWave; title: string; hint: string; advanceTo: OrderStatus }[] = [
  { id: 'pendiente', title: 'Recibidos', hint: 'Nuevos y adicionales', advanceTo: 'en_cocina' },
  { id: 'en_cocina', title: 'En fuego', hint: 'Preparando', advanceTo: 'listo' },
  { id: 'listo', title: 'Listos', hint: 'Para entregar', advanceTo: 'entregado' },
]

type KitchenTicket = {
  key: string
  order: Order
  wave: KitchenWave
  items: Order['items']
  isAdditional: boolean
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
      const wavesActive = [pendiente.length > 0, enFuego.length > 0, listos.length > 0].filter(Boolean).length

      if (pendiente.length) {
        list.push({
          key: `${o.id}:pendiente`,
          order: o,
          wave: 'pendiente',
          items: pendiente,
          isAdditional: wavesActive > 1 || o.status === 'en_cocina' || enFuego.length > 0 || listos.length > 0,
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
      if (listos.length && o.status !== 'entregado') {
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
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Pantalla de cocina" hint={`${tickets.length} tickets activos`} />
        <div className="flex items-center gap-2">
          {!soundOn ? (
            <button
              type="button"
              onClick={enableSound}
              className="flex min-h-10 items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white"
            >
              <Volume2 size={16} /> Activar sonido
            </button>
          ) : (
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-cream/70">Sonido ON</span>
          )}
          <div className="rounded-full bg-ink px-4 py-2 font-display text-xl text-gold">
            {new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible">
        {COLS.map((col) => {
          const colTickets = tickets
            .filter((t) => t.wave === col.id)
            .sort((a, b) => a.order.updatedAt.localeCompare(b.order.updatedAt))
          return (
            <section
              key={col.id}
              className="w-[min(86vw,22rem)] shrink-0 rounded-3xl bg-ink p-4 text-cream lg:w-auto"
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-2xl text-gold">{col.title}</h2>
                <span className="text-sm text-cream/40">{colTickets.length}</span>
              </div>
              <p className="mb-4 text-xs text-cream/40">{col.hint}</p>
              <div className="space-y-3">
                {colTickets.map((t) => (
                  <KitchenCard
                    key={t.key}
                    order={t.order}
                    kitchenItems={t.items}
                    wave={t.wave}
                    isAdditional={t.isAdditional}
                    onPrint={() =>
                      printTicket(
                        {
                          ...t.order,
                          items: t.items,
                          notes: [
                            t.isAdditional ? 'ADICIONAL' : '',
                            t.order.source === 'web' ? 'WEB / APP' : '',
                            t.order.notes || '',
                          ]
                            .filter(Boolean)
                            .join(' · '),
                        },
                        state.settings,
                        'cocina',
                      )
                    }
                    onAdvance={() => {
                      if (col.advanceTo === 'listo') playSound('listo')
                      updateOrderStatus(t.order.id, col.advanceTo, t.wave === 'listo' ? undefined : t.wave)
                    }}
                  />
                ))}
                {colTickets.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-cream/30">
                    Vacío
                  </p>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function KitchenCard({
  order,
  kitchenItems,
  wave,
  isAdditional,
  onAdvance,
  onPrint,
}: {
  order: Order
  kitchenItems: Order['items']
  wave: KitchenWave
  isAdditional: boolean
  onAdvance: () => void
  onPrint: () => void
}) {
  const mins = elapsedMinutes(order.updatedAt || order.createdAt)
  const late = mins >= 15 && wave !== 'listo'
  const btn =
    wave === 'pendiente' ? 'Empezar' : wave === 'en_cocina' ? 'Marcar listo' : 'Entregar'
  return (
    <article className={`rounded-2xl bg-cream p-4 text-ink ${late ? 'ring-2 ring-ember' : ''} ${isAdditional ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-2xl">{padOrder(order.number)}</p>
          <p className="text-xs text-ink/50">
            {order.tableNumber ? `Mesa ${order.tableNumber}` : order.customerName} · {order.type}
            {order.source === 'web' ? ' · APP' : ''}
          </p>
          {isAdditional ? (
            <p className="mt-1 text-[11px] font-bold tracking-wide text-amber-700 uppercase">
              Adicional · misma mesa
            </p>
          ) : null}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${late ? 'bg-ember text-white' : 'bg-ink/10'}`}>
          {mins} min
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {kitchenItems.map((i, idx) => (
          <li key={i.id || idx} className="text-sm">
            <span className="font-bold">{i.qty}×</span> {i.name}
            {i.notes ? <span className="block text-xs text-ember">{i.notes}</span> : null}
          </li>
        ))}
      </ul>
      {order.notes ? <p className="mt-2 text-xs italic text-ink/50">{order.notes}</p> : null}
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <button onClick={onAdvance} className="min-h-11 rounded-xl bg-ember py-2 text-sm font-semibold text-white">
          {btn}
        </button>
        <button onClick={onPrint} className="tap rounded-xl bg-white px-3" aria-label="Imprimir comanda">
          <Printer size={16} />
        </button>
      </div>
    </article>
  )
}
