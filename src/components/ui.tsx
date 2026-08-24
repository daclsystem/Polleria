import type { ReactNode } from 'react'
import { ROLE_LABEL, STATUS_LABEL, TYPE_LABEL, type OrderStatus, type OrderType, type Role } from '../types'

export function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    nuevo: 'bg-ember/15 text-ember ring-ember/20',
    en_cocina: 'bg-amber-100 text-amber-800 ring-amber-200',
    listo: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    entregado: 'bg-stone-100 text-stone-600 ring-stone-200',
    cancelado: 'bg-rose-100 text-rose-800 ring-rose-200',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${map[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function TypeBadge({ type }: { type: OrderType }) {
  return (
    <span className="inline-flex rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-medium text-ink/70">
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
      <button className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Cerrar" />
      <div
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-display text-xl font-semibold sm:text-2xl">{title}</h3>
          <button
            onClick={onClose}
            className="tap flex items-center justify-center rounded-full text-xl text-ink/50 hover:bg-ink/5 hover:text-ink"
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
      <span className="text-[11px] font-semibold tracking-wide text-ink/50 uppercase">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white px-3.5 py-3 text-base outline-none ring-ember/25 transition placeholder:text-ink/30 focus:border-ember/40 focus:ring-2 md:py-2.5 md:text-sm'

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-ink/15 bg-white/60 px-6 py-14 text-center">
      <p className="font-display text-lg sm:text-xl">{title}</p>
      {hint ? <p className="mt-1 text-sm text-ink/50">{hint}</p> : null}
    </div>
  )
}

export function PageTitle({ kicker, title, hint }: { kicker?: string; title: string; hint?: string }) {
  return (
    <div className="min-w-0">
      {kicker ? (
        <p className="text-[11px] font-semibold tracking-[0.18em] text-ember uppercase">{kicker}</p>
      ) : null}
      <h1 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
      {hint ? <p className="mt-1 text-sm text-ink/50">{hint}</p> : null}
    </div>
  )
}
