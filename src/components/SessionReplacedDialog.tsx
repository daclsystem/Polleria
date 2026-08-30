import { Smartphone } from 'lucide-react'

export function SessionReplacedDialog({
  open,
  message,
  onAck,
}: {
  open: boolean
  message?: string
  onAck: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[99995] flex items-end justify-center bg-ink/55 p-0 backdrop-blur-[6px] sm:items-center sm:p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-replaced-title"
        className="relative w-full max-w-sm overflow-hidden rounded-t-[1.75rem] bg-surface text-ink shadow-2xl sm:rounded-[1.75rem]"
      >
        <div className="bg-gradient-to-br from-ember to-[#9B2226] px-6 pb-8 pt-8 text-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Smartphone size={30} strokeWidth={2.2} />
          </div>
          <h2 id="session-replaced-title" className="mt-4 text-center font-display text-2xl font-semibold">
            Sesión en otro dispositivo
          </h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p className="text-center text-sm leading-relaxed text-ink/65">
            {message || 'Iniciaste sesión en otro celular o computadora. Esta queda cerrada por seguridad.'}
          </p>
          <button
            type="button"
            onClick={onAck}
            className="w-full rounded-2xl bg-ember py-3.5 text-sm font-bold text-white shadow-lg shadow-ember/20"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
