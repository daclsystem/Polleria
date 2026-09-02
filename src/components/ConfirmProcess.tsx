import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'

export function ConfirmProcess({
  open,
  phase,
  title,
  message,
  confirmLabel = 'Sí, continuar',
  doneTitle = 'Procesado',
  doneMessage = 'Listo. El movimiento quedó registrado.',
  busyLabel = 'Procesando…',
  tone = 'ember',
  onConfirm,
  onCancel,
  onDone,
}: {
  open: boolean
  phase: 'confirm' | 'busy' | 'done'
  title: string
  message: ReactNode
  confirmLabel?: string
  doneTitle?: string
  doneMessage?: string
  busyLabel?: string
  tone?: 'ember' | 'brick' | 'ink'
  onConfirm: () => void
  onCancel: () => void
  onDone: () => void
}) {
  if (!open) return null
  const btn =
    tone === 'brick' ? 'bg-brick text-white' : tone === 'ink' ? 'bg-ink text-cream' : 'bg-ember text-white'

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/50"
        aria-label="Cerrar"
        onClick={() => {
          if (phase === 'busy') return
          if (phase === 'done') onDone()
          else onCancel()
        }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl bg-surface p-6 text-ink shadow-2xl sm:rounded-3xl">
        {phase === 'done' ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={44} />
            <h3 className="mt-3 text-xl font-black tracking-tight">{doneTitle}</h3>
            <p className="mt-2 text-sm text-ink/60">{doneMessage}</p>
            <button
              type="button"
              onClick={onDone}
              className="mt-5 min-h-11 w-full rounded-2xl bg-emerald-600 text-sm font-bold text-white"
            >
              Entendido
            </button>
          </div>
        ) : (
          <div>
            <h3 className="text-xl font-black tracking-tight">{title}</h3>
            <div className="mt-2 text-sm text-ink/60">{message}</div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={phase === 'busy'}
                onClick={onCancel}
                className="min-h-11 rounded-2xl bg-ink/[0.06] px-3 text-sm font-semibold text-ink disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={phase === 'busy'}
                onClick={onConfirm}
                className={`min-h-11 rounded-2xl px-3 text-sm font-bold disabled:opacity-40 ${btn}`}
              >
                {phase === 'busy' ? busyLabel : confirmLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
