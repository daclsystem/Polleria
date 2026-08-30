import { Bell, MapPin } from 'lucide-react'
import { ensureWebNotifications, notifyWeb } from '../lib/webNotify'

export function notificationsGranted() {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
}

export function permissionsPromptSkipped(key: string) {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function skipPermissionsPrompt(key: string) {
  try {
    sessionStorage.setItem(key, '1')
  } catch {
    /* ignore */
  }
}

export async function askDevicePermissions(opts: {
  requestLocation: () => Promise<unknown> | unknown
  notifyTitle: string
  notifyBody: string
}) {
  const notifyOk = await ensureWebNotifications(true)
  let locOk = false
  try {
    await opts.requestLocation()
    locOk = true
  } catch {
    locOk = false
  }
  if (notifyOk) notifyWeb(opts.notifyTitle, opts.notifyBody)
  return { notifyOk, locOk }
}

export function DevicePermissionsPrompt({
  open,
  title,
  hint,
  onActivate,
  onSkip,
}: {
  open: boolean
  title: string
  hint: string
  onActivate: () => void | Promise<void>
  onSkip: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-ink/50" aria-label="Cerrar" onClick={onSkip} />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <p className="text-[10px] font-bold tracking-[0.18em] text-ember uppercase">Permisos</p>
        <h2 className="mt-1 font-display text-2xl tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-ink/55">{hint}</p>
        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-ember">
              <MapPin size={18} />
            </span>
            <div>
              <p className="text-sm font-bold">Ubicación</p>
              <p className="text-xs text-ink/50">Para delivery y ver el pedido en el mapa.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-ember">
              <Bell size={18} />
            </span>
            <div>
              <p className="text-sm font-bold">Notificaciones</p>
              <p className="text-xs text-ink/50">Avisos cuando cambie el estado del pedido.</p>
            </div>
          </li>
        </ul>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="min-h-11 rounded-2xl bg-ink/[0.06] px-3 text-sm font-semibold text-ink"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={() => void onActivate()}
            className="min-h-11 rounded-2xl bg-ember px-3 text-sm font-bold text-white"
          >
            Activar
          </button>
        </div>
      </div>
    </div>
  )
}
