import type { ReactNode } from 'react'
import { ROLE_LABEL, STATUS_LABEL, TYPE_LABEL, type OrderStatus, type OrderType, type Role } from '../types'

export function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    nuevo: 'bg-ember/12 text-ember ring-ember/15',
    en_cocina: 'bg-amber-50 text-amber-800 ring-amber-100',
    listo: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    entregado: 'bg-stone-50 text-stone-600 ring-stone-100',
    cancelado: 'bg-rose-50 text-rose-700 ring-rose-100',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${map[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function TypeBadge({ type }: { type: OrderType }) {
  return (
    <span className="inline-flex rounded-full bg-ink/[0.04] px-2.5 py-1 text-[11px] font-semibold text-ink/65">
      {TYPE_LABEL[type]}
    </span>
  )
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
      {ROLE_LABEL[role]}
    </span>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-ink/50 backdrop-blur-[3px]" onClick={onClose} aria-label="Cerrar" />
      <div
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.75rem] bg-surface p-5 text-ink shadow-2xl sm:rounded-[1.75rem] ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/10 sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h3>
          <button
            onClick={onClose}
            className="tap flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.04] text-xl text-ink/45 hover:bg-ink/[0.08] hover:text-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-bold tracking-[0.14em] text-ink/40 uppercase">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-2xl border border-ink/[0.08] bg-surface px-4 py-3.5 text-base text-ink shadow-sm outline-none transition placeholder:text-ink/30 focus:border-ember/35 focus:ring-4 focus:ring-ember/10 md:py-3 md:text-sm'

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-ink/12 bg-surface/70 px-6 py-14 text-center text-ink">
      <p className="font-display text-lg tracking-tight sm:text-xl">{title}</p>
      {hint ? <p className="mt-1 text-sm text-ink/45">{hint}</p> : null}
    </div>
  )
}

export function PageTitle({ kicker, title, hint }: { kicker?: string; title: string; hint?: string }) {
  return (
    <div className="min-w-0">
      {kicker ? (
        <p className="text-[11px] font-bold tracking-[0.18em] text-ember uppercase">{kicker}</p>
      ) : null}
      <h1 className="font-display text-[1.85rem] leading-[1.1] tracking-tight sm:text-4xl">{title}</h1>
      {hint ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/45">{hint}</p> : null}
    </div>
  )
}
