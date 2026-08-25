import { useCallback, useEffect, useRef, useState } from 'react'
import { getDeviceOS, locationHelpForOS, type DeviceOS } from '../lib/platform'

export type DeviceCoords = {
  lat: number
  lng: number
  accuracy?: number
  at: number
}

export type LocationStatus = 'idle' | 'prompting' | 'granted' | 'denied' | 'unavailable' | 'error'

type Options = {
  /** Si true, pide ubicación al montar */
  auto?: boolean
  /** watchPosition continuo (conductor) */
  watch?: boolean
  enableHighAccuracy?: boolean
  maximumAge?: number
  timeout?: number
  onUpdate?: (coords: DeviceCoords) => void
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string }
    return data.display_name || null
  } catch {
    return null
  }
}

/**
 * Geolocalización del navegador con mensajes según SO
 * (patrón similar a MatchStoreSystem useGeolocationPermission).
 */
export function useDeviceLocation(opts: Options = {}) {
  const {
    auto = false,
    watch = false,
    enableHighAccuracy = true,
    maximumAge = 15000,
    timeout = 20000,
    onUpdate,
  } = opts

  const [coords, setCoords] = useState<DeviceCoords | null>(null)
  const [addressHint, setAddressHint] = useState<string | null>(null)
  const [status, setStatus] = useState<LocationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const os = useRef<DeviceOS>(getDeviceOS())
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const watchIdRef = useRef<number | null>(null)

  const applyPos = useCallback((pos: GeolocationPosition, withAddress = false) => {
    const next: DeviceCoords = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      at: Date.now(),
    }
    setCoords(next)
    setStatus('granted')
    setError(null)
    onUpdateRef.current?.(next)
    if (withAddress) {
      void reverseGeocode(next.lat, next.lng).then((a) => {
        if (a) setAddressHint(a)
      })
    }
  }, [])

  const fail = useCallback((err: GeolocationPositionError | Error) => {
    const code = 'code' in err ? err.code : undefined
    if (code === 1) {
      setStatus('denied')
      setError(locationHelpForOS(os.current))
    } else if (code === 2) {
      setStatus('error')
      setError('No se pudo obtener GPS. Revisa que el GPS esté encendido.')
    } else if (code === 3) {
      setStatus('error')
      setError('Tiempo agotado al pedir ubicación. Intenta de nuevo.')
    } else {
      setStatus('error')
      setError(err.message || 'Error de ubicación')
    }
  }, [])

  const requestOnce = useCallback(
    (withAddress = true) => {
      if (!('geolocation' in navigator)) {
        setStatus('unavailable')
        setError('Este dispositivo no soporta geolocalización')
        return Promise.reject(new Error('Geolocation unavailable'))
      }
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setStatus('error')
        setError('La ubicación requiere HTTPS (o localhost)')
        return Promise.reject(new Error('Insecure context'))
      }
      setStatus('prompting')
      return new Promise<DeviceCoords>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            applyPos(pos, withAddress)
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              at: Date.now(),
            })
          },
          (e) => {
            fail(e)
            reject(e)
          },
          { enableHighAccuracy, maximumAge, timeout },
        )
      })
    },
    [applyPos, enableHighAccuracy, fail, maximumAge, timeout],
  )

  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      setError('Este dispositivo no soporta geolocalización')
      return
    }
    if (watchIdRef.current != null) return
    setStatus('prompting')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => applyPos(pos, false),
      (e) => fail(e),
      { enableHighAccuracy, maximumAge, timeout },
    )
  }, [applyPos, enableHighAccuracy, fail, maximumAge, timeout])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!auto) return
    let cancelled = false

    const start = () => {
      if (cancelled) return
      if (watch) startWatch()
      else void requestOnce(true).catch(() => undefined)
    }

    const permissionsApi = (
      navigator as Navigator & {
        permissions?: { query: (o: { name: PermissionName }) => Promise<PermissionStatus> }
      }
    ).permissions

    if (permissionsApi?.query) {
      permissionsApi
        .query({ name: 'geolocation' as PermissionName })
        .then((st) => {
          if (cancelled) return
          if (st.state === 'denied') {
            setStatus('denied')
            setError(locationHelpForOS(os.current))
            return
          }
          start()
          st.onchange = () => {
            if (st.state === 'denied') {
              setStatus('denied')
              setError(locationHelpForOS(os.current))
              stopWatch()
            } else if (st.state === 'granted') start()
          }
        })
        .catch(() => start())
    } else {
      // Safari iOS: sin Permissions API → pedir directo
      start()
    }

    return () => {
      cancelled = true
      stopWatch()
    }
  }, [auto, watch, requestOnce, startWatch, stopWatch])

  return {
    coords,
    addressHint,
    status,
    error,
    os: os.current,
    requestOnce,
    startWatch,
    stopWatch,
    reverseGeocode,
  }
}
