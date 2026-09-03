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

  const getButtonVariant = () => {
    if (tone === 'brick') return 'danger'
    return 'primary'
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => {
          if (phase === 'busy') return
          if (phase === 'done') onDone()
          else onCancel()
        }}
        aria-label="Cerrar"
      />
      
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-[320px] rounded-3xl bg-[#1c1c1e] p-6 shadow-2xl">
        {phase === 'done' ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto text-sage" size={44} />
            <h3 className="mt-3 text-center text-[17px] font-semibold leading-snug text-white">{doneTitle}</h3>
            <p className="mt-2 text-center text-[13px] leading-relaxed text-white/60">{doneMessage}</p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onDone}
                className="min-h-12 w-full rounded-xl border border-sage/30 bg-transparent text-sm font-semibold text-sage transition-colors hover:bg-sage/10 active:bg-sage/15"
              >
                Entendido
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-center text-[17px] font-semibold leading-snug text-white">{title}</h3>
            {message && (
              <div className="mt-2 text-center text-[13px] leading-relaxed text-white/60">{message}</div>
            )}
            <div className="mt-5 space-y-2">
              <button
                type="button"
                disabled={phase === 'busy'}
                onClick={onConfirm}
                className={`min-h-12 w-full rounded-xl border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  getButtonVariant() === 'danger'
                    ? 'border-brick/30 bg-transparent text-brick hover:bg-brick/10 active:bg-brick/15'
                    : 'border-sage/30 bg-transparent text-sage hover:bg-sage/10 active:bg-sage/15'
                }`}
              >
                {phase === 'busy' ? busyLabel : confirmLabel}
              </button>
              <button
                type="button"
                disabled={phase === 'busy'}
                onClick={onCancel}
                className="min-h-12 w-full rounded-xl border border-sage/30 bg-transparent text-sm font-semibold text-sage transition-colors hover:bg-sage/10 active:bg-sage/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
