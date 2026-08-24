import { useEffect, useRef, useState } from 'react'
import { Printer, Volume2 } from 'lucide-react'
import { elapsedMinutes, padOrder } from '../lib/format'
import { printTicket } from '../lib/print'
import { playSound, unlockSounds } from '../lib/sounds'
import { useStore } from '../store/StoreContext'
import type { Order, OrderStatus } from '../types'
import { PageTitle } from '../components/ui'

const COLS: { id: OrderStatus; title: string; hint: string }[] = [
  { id: 'nuevo', title: 'Recibidos', hint: 'Aún no se tocan' },
  { id: 'en_cocina', title: 'En fuego', hint: 'Preparando' },
  { id: 'listo', title: 'Listos', hint: 'Para entregar' },
]

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  nuevo: 'en_cocina',
  en_cocina: 'listo',
  listo: 'entregado',
}

export function Cocina() {
  const { state, updateOrderStatus } = useStore()
  const live = state.orders.filter((o) => o.status === 'nuevo' || o.status === 'en_cocina' || o.status === 'listo')
  const knownNuevos = useRef<Set<string>>(new Set())
  const primed = useRef(false)
  const [soundOn, setSoundOn] = useState(false)

  useEffect(() => {
    const nuevos = state.orders.filter((o) => o.status === 'nuevo')
    const ids = new Set(nuevos.map((o) => o.id))
    if (!primed.current) {
      knownNuevos.current = ids
      primed.current = true
      return
    }
    for (const o of nuevos) {
      if (!knownNuevos.current.has(o.id)) {
        playSound('nuevo')
        break
      }
    }
    knownNuevos.current = ids
  }, [state.orders])

  const enableSound = () => {
    unlockSounds()
    setSoundOn(true)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Pantalla de cocina" hint={`${live.length} comandas activas`} />
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
          const orders = live
            .filter((o) => o.status === col.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          return (
            <section
              key={col.id}
              className="w-[min(86vw,22rem)] shrink-0 rounded-3xl bg-ink p-4 text-cream lg:w-auto"
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-2xl text-gold">{col.title}</h2>
                <span className="text-sm text-cream/40">{orders.length}</span>
              </div>
              <p className="mb-4 text-xs text-cream/40">{col.hint}</p>
              <div className="space-y-3">
                {orders.map((o) => (
                  <KitchenCard
                    key={o.id}
                    order={o}
                    onPrint={() => printTicket(o, state.settings, 'cocina')}
                    onAdvance={() => {
                      const n = NEXT[o.status]
                      if (n) {
                        if (n === 'listo') playSound('listo')
                        updateOrderStatus(o.id, n)
                      }
                    }}
                  />
                ))}
                {orders.length === 0 ? (
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
  onAdvance,
  onPrint,
}: {
  order: Order
  onAdvance: () => void
  onPrint: () => void
}) {
  const mins = elapsedMinutes(order.createdAt)
  const late = mins >= 15
  return (
    <article className={`rounded-2xl bg-cream p-4 text-ink ${late ? 'ring-2 ring-ember' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-2xl">{padOrder(order.number)}</p>
          <p className="text-xs text-ink/50">
            {order.tableNumber ? `Mesa ${order.tableNumber}` : order.customerName} · {order.type}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${late ? 'bg-ember text-white' : 'bg-ink/10'}`}>
          {mins} min
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {order.items.map((i, idx) => (
          <li key={idx} className="text-sm">
            <span className="font-bold">{i.qty}×</span> {i.name}
            {i.notes ? <span className="block text-xs text-ember">{i.notes}</span> : null}
          </li>
        ))}
      </ul>
      {order.notes ? <p className="mt-2 text-xs italic text-ink/50">{order.notes}</p> : null}
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <button onClick={onAdvance} className="min-h-11 rounded-xl bg-ember py-2 text-sm font-semibold text-white">
          {order.status === 'nuevo' ? 'Empezar' : order.status === 'en_cocina' ? 'Marcar listo' : 'Entregar'}
        </button>
        <button onClick={onPrint} className="tap rounded-xl bg-white px-3" aria-label="Imprimir comanda">
          <Printer size={16} />
        </button>
      </div>
    </article>
  )
}
