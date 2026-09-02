import { useEffect, useRef, useState } from 'react'
import { APP_VERSION, isNewerVersion } from '../lib/version'

const POLL_MS = 30_000
const COUNTDOWN_SEC = 5
const STORAGE_KEY = 'polleria-app-version'

type VersionPayload = { version?: string; build?: string }

function versionUrl() {
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}version.json?t=${Date.now()}`
}

/**
 * Vigila version.json del build publicado.
 * Solo recarga si la remota es estrictamente más nueva (nunca “baja” de versión).
 * En desarrollo no corre: el JS y el middleware pueden desfasarse al editar version.ts.
 */
export function VersionUpdateWatcher() {
  const [open, setOpen] = useState(false)
  const [remoteVersion, setRemoteVersion] = useState('')
  const [seconds, setSeconds] = useState(COUNTDOWN_SEC)
  const reloading = useRef(false)

  useEffect(() => {
    if (import.meta.env.DEV) return

    try {
      localStorage.setItem(STORAGE_KEY, APP_VERSION)
    } catch {
      /* ignore */
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    const check = async () => {
      if (cancelled || reloading.current || open) return
      try {
        const res = await fetch(versionUrl(), { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as VersionPayload
        const next = String(data.version || '').trim()
        if (next && isNewerVersion(next, APP_VERSION)) {
          setRemoteVersion(next)
          setSeconds(COUNTDOWN_SEC)
          setOpen(true)
        }
      } catch {
        /* offline / sin version.json aún */
      }
    }

    void check()
    timer = setInterval(() => void check(), POLL_MS)

    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void check()
    })

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [open])

  const forceReload = () => {
    if (reloading.current) return
    reloading.current = true
    if ('caches' in window) {
      caches.keys().then((names) => names.forEach((name) => caches.delete(name)))
    }
    const url = new URL(window.location.href)
    url.searchParams.set('_reload', Date.now().toString())
    window.location.href = url.toString()
  }

  useEffect(() => {
    if (!open) return
    setSeconds(COUNTDOWN_SEC)
    const tick = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(tick)
          forceReload()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-update-title"
        className="w-full max-w-sm rounded-3xl bg-surface p-6 text-center text-ink shadow-2xl ring-1 ring-ink/10"
      >
        <p className="text-xs font-bold tracking-[0.2em] text-ember uppercase">Actualización</p>
        <h2 id="version-update-title" className="mt-2 text-xl font-black text-ink">
          Nueva versión disponible
        </h2>
        <p className="mt-2 text-sm text-ink/60">
          v{APP_VERSION} → <span className="font-bold text-ember">v{remoteVersion}</span>
        </p>
        <p className="mt-4 text-sm text-ink/50">
          Se actualizará automáticamente en{' '}
          <span className="font-black text-ink">{seconds}</span> s…
        </p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-ember transition-all duration-1000 ease-linear"
            style={{ width: `${((COUNTDOWN_SEC - seconds) / COUNTDOWN_SEC) * 100}%` }}
          />
        </div>
        <button
          type="button"
          className="mt-5 w-full rounded-2xl bg-ember py-3 text-sm font-bold text-cream"
          onClick={forceReload}
        >
          Actualizar ahora
        </button>
      </div>
    </div>
  )
}
