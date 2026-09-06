import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Printer } from 'lucide-react'
import { printTicket } from '../lib/print'
import { filterKitchenItems } from '../lib/kitchen'
import { useStore } from '../store/StoreContext'
import type { Order } from '../types'

const OPTIONS = [
  ['cocina', 'Cocina'],
  ['caja', 'Caja'],
  ['cuenta', 'Pre-cuenta'],
] as const

/** Un botón Imprimir con subopciones: cocina, caja y pre-cuenta. */
export function PrintOrderActions({ order }: { order: Order }) {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 8, openUp: true })
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const menuH = 148
    const gap = 6
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < menuH + gap + 12
    setPos({
      top: openUp ? r.top - gap : r.bottom + gap,
      right: Math.max(8, window.innerWidth - r.right),
      openUp,
    })
  }

  useEffect(() => {
    if (!open) return
    place()
    const close = (e: PointerEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onMove = () => setOpen(false)
    document.addEventListener('pointerdown', close)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
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

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[80] min-w-[12rem] overflow-hidden rounded-2xl bg-surface py-1 shadow-xl ring-1 ring-ink/10"
            style={{
              top: pos.top,
              right: pos.right,
              transform: pos.openUp ? 'translateY(-100%)' : undefined,
            }}
          >
            {OPTIONS.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-gold/15"
                onClick={() => print(kind)}
              >
                <Printer size={14} />
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-bold ring-1 ring-ink/10"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Printer size={14} />
        Imprimir
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  )
}
