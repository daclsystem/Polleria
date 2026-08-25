import { LogOut } from 'lucide-react'
import { defaultAvatarUrl, shortAccountId } from '../lib/avatar'

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
  const src = photoUrl || defaultAvatarUrl(name, tone)
  const idLabel = shortAccountId(accountId)

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex flex-col items-center text-center">
          <img
            src={src}
            alt={name}
            className="h-20 w-20 rounded-full object-cover ring-4 ring-ember/15"
          />
          <p className="mt-3 text-lg font-bold text-ink">{name}</p>
          {roleLabel ? <p className="text-sm text-ink/50">{roleLabel}</p> : null}
          <p className="mt-1 font-mono text-xs font-semibold tracking-wider text-ink/40">
            ID · {idLabel}
          </p>
          <p className="mt-4 text-sm text-ink/60">¿Cerrar esta sesión?</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-2xl bg-ink/[0.06] px-3 text-sm font-semibold text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-ember px-3 text-sm font-semibold text-white"
          >
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}
