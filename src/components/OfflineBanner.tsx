import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

const RESTORED_MS = 2_400

/**
 * Aviso global de pérdida de internet. Montar en cada app (web, system, driver, cliente).
 */
export function OfflineBanner() {
  const { offline, checking, retry } = useOnlineStatus()
  const [restored, setRestored] = useState(false)
  const wasOffline = useRef(offline)

  useEffect(() => {
    if (offline) {
      wasOffline.current = true
      setRestored(false)
      return
    }
    if (!wasOffline.current) return
    wasOffline.current = false
    setRestored(true)
    const t = window.setTimeout(() => setRestored(false), RESTORED_MS)
    return () => window.clearTimeout(t)
  }, [offline])

  if (!offline && !restored) return null

  if (restored) {
    return (
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[99990] flex items-center justify-center gap-2 bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white shadow-lg"
        style={{ paddingTop: 'max(0.6rem, env(safe-area-inset-top))' }}
      >
        <Wifi size={18} strokeWidth={2.4} />
        Conexión restablecida
      </div>
    )
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-[99990] bg-[#c81e1e] text-white shadow-lg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-4">
        <WifiOff className="shrink-0" size={22} strokeWidth={2.4} />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="text-sm font-black">Sin conexión a internet</p>
          <p className="text-xs font-semibold text-white/85">
            Revisa tu red. Pedidos y datos no se actualizarán hasta que vuelva.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={checking}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wide ring-1 ring-white/30 hover:bg-white/25 disabled:opacity-70"
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Comprobando' : 'Reintentar'}
        </button>
      </div>
    </div>
  )
}
