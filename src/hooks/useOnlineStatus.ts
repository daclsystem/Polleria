import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '../lib/api'

const PING_MS = 12_000
const PING_TIMEOUT_MS = 8_000
/** Fallos seguidos del ping antes de marcar sin red (si el navegador dice que hay internet). */
const FAIL_THRESHOLD = 2

async function pingHealth(signal: AbortSignal) {
  const res = await fetch(apiUrl('/health'), {
    method: 'GET',
    cache: 'no-store',
    signal,
  })
  return res.ok
}

function browserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function useOnlineStatus() {
  const [offline, setOffline] = useState(() => browserOffline())
  const [checking, setChecking] = useState(false)
  const fails = useRef(0)
  const inFlight = useRef(false)

  const applyOffline = useCallback((next: boolean) => {
    setOffline((prev) => (prev === next ? prev : next))
  }, [])

  const check = useCallback(async () => {
    if (inFlight.current) return
    if (browserOffline()) {
      fails.current = FAIL_THRESHOLD
      applyOffline(true)
      return
    }

    inFlight.current = true
    setChecking(true)
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)

    try {
      const ok = await pingHealth(ctrl.signal)
      if (ok) {
        fails.current = 0
        applyOffline(false)
      } else {
        fails.current += 1
        if (fails.current >= FAIL_THRESHOLD) applyOffline(true)
      }
    } catch {
      if (browserOffline()) {
        fails.current = FAIL_THRESHOLD
        applyOffline(true)
      } else {
        fails.current += 1
        if (fails.current >= FAIL_THRESHOLD) applyOffline(true)
      }
    } finally {
      window.clearTimeout(timer)
      inFlight.current = false
      setChecking(false)
    }
  }, [applyOffline])

  useEffect(() => {
    void check()
    const interval = window.setInterval(() => void check(), PING_MS)

    const onOffline = () => {
      fails.current = FAIL_THRESHOLD
      applyOffline(true)
    }
    const onOnline = () => {
      fails.current = 0
      void check()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onOnline)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [applyOffline, check])

  return { offline, checking, retry: check }
}
