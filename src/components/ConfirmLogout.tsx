import { LogOut } from 'lucide-react'
import { shortAccountId } from '../lib/avatar'
import { PersonAvatar } from './PersonAvatar'

type Tone = 'staff' | 'customer' | 'driver'

export function ConfirmLogout({
  open,
  name,
  roleLabel,
  accountId,
  photoUrl,
  tone = 'staff',
  onConfirm,
  onCancel,
}: {
  open: boolean
  name: string
  roleLabel?: string
  accountId: string
  photoUrl?: string
  tone?: Tone
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  const idLabel = shortAccountId(accountId)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Cerrar"
      />
      
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-[320px] rounded-3xl bg-[#1c1c1e] p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <PersonAvatar name={name} photoUrl={photoUrl} tone={tone} className="h-20 w-20 text-xl" />
          <p className="mt-3 text-lg font-bold text-white">{name}</p>
          {roleLabel ? <p className="text-sm text-white/50">{roleLabel}</p> : null}
          <p className="mt-1 font-mono text-xs font-semibold tracking-wider text-white/40">
            ID · {idLabel}
          </p>
          <p className="mt-4 text-[13px] text-white/60">¿Cerrar esta sesión?</p>
        </div>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brick/30 bg-transparent text-sm font-semibold text-brick transition-colors hover:bg-brick/10 active:bg-brick/15"
          >
            <LogOut size={16} />
            Salir
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 w-full rounded-xl border border-sage/30 bg-transparent text-sm font-semibold text-sage transition-colors hover:bg-sage/10 active:bg-sage/15"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
