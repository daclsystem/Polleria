import { useId, type ReactNode } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { ROLE_LABEL, STATUS_LABEL, TYPE_LABEL, type OrderStatus, type OrderType, type Role } from '../types'

export function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    nuevo: 'bg-ember/12 text-ember ring-ember/15',
    en_cocina: 'bg-amber-50 text-amber-800 ring-amber-100',
    listo: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    entregado: 'bg-ink/[0.06] text-ink/70 ring-ink/15',
    cancelado: 'bg-rose-50 text-rose-700 ring-rose-100',
    eliminado: 'bg-ink/10 text-ink/55 ring-ink/15',
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
  const titleId = useId()
  const { panelRef, onKeyDown } = useDialogFocus(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-ink/50 backdrop-blur-[3px]" onClick={onClose} aria-label="Cerrar diálogo" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        className={`relative min-w-0 max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-surface p-5 text-ink shadow-2xl outline-none sm:rounded-[1.75rem] ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/10 sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="min-w-0 text-xl font-black tracking-tight [overflow-wrap:anywhere] sm:text-2xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo"
            className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/[0.04] text-xl text-ink/45 hover:bg-ink/[0.08] hover:text-ink"
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
    <label className="block min-w-0 space-y-1.5">
      <span className="text-[11px] font-bold tracking-[0.14em] text-ink/40 uppercase">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'min-h-12 w-full min-w-0 max-w-full rounded-2xl border border-ink/[0.08] bg-surface px-4 py-3.5 text-base text-ink shadow-sm outline-none transition placeholder:text-ink/30 focus:border-gold focus:ring-4 focus:ring-gold/20 md:py-3'

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-ink/12 bg-surface/70 px-6 py-14 text-center text-ink">
      <p className="text-lg font-black tracking-tight sm:text-xl">{title}</p>
      {hint ? <p className="mt-1 text-sm text-ink/45">{hint}</p> : null}
    </div>
  )
}

export function PageTitle({ kicker, title, hint }: { kicker?: string; title: string; hint?: string }) {
  return (
    <div className="min-w-0">
      {kicker ? (
        <p className="text-[10px] font-bold tracking-[0.2em] text-[#1a3d1a] uppercase dark:text-gold">
          {kicker}
        </p>
      ) : null}
      <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-[1.75rem]">{title}</h1>
      {hint ? <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink/45">{hint}</p> : null}
    </div>
  )
}
