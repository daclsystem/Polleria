import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Printer } from 'lucide-react'
import { printTicket } from '../lib/print'
import { filterKitchenItems } from '../lib/kitchen'
import { useStore } from '../store/StoreContext'
import type { Order } from '../types'

/** Un botón Imprimir con subopciones: cocina, caja y pre-cuenta. */
export function PrintOrderActions({ order }: { order: Order }) {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const print = (kind: 'caja' | 'cocina' | 'cuenta') => {
    setOpen(false)
    if (kind === 'cocina') {
      const kitchen = filterKitchenItems(order.items, state.products)
      if (kitchen.length === 0) {
        alert('Este pedido no tiene ítems de preparación (solo barra).')
        return
      }
      void printTicket(
        {
          ...order,
          items: kitchen,
          notes: order.source === 'web' ? `WEB / APP · ${order.notes || ''}`.trim() : order.notes,
        },
        state.settings,
        'cocina',
        state.users,
      )
      return
    }
    void printTicket(order, state.settings, kind, state.users)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-bold ring-1 ring-ink/10"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Printer size={14} />
        Imprimir
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-2xl bg-surface py-1 shadow-xl ring-1 ring-ink/10">
          {(
            [
              ['cocina', 'Cocina'],
              ['caja', 'Caja'],
              ['cuenta', 'Pre-cuenta'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-gold/15"
              onClick={() => print(kind)}
            >
              <Printer size={14} />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
