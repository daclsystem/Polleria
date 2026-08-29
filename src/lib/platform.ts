/** Detección de plataforma / SO (web). Adaptado de MatchStore cliente. */

export type PlatformKind = 'iosweb' | 'androidweb' | 'web'
export type DeviceOS = 'android' | 'ios' | 'windows' | 'mac' | 'linux' | 'other'

export function getPlataforma(): PlatformKind {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent || ''
  const esIpad =
    /iPad/i.test(ua) ||
    ((navigator as Navigator & { platform?: string }).platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1)
  if (/iPhone|iPod/i.test(ua) || esIpad) return 'iosweb'
  if (/Android/i.test(ua)) return 'androidweb'
  return 'web'
}

export function getDeviceOS(): DeviceOS {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  const plat = (navigator as Navigator & { platform?: string }).platform || ''
  const esIpad = /iPad/i.test(ua) || (plat === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPod/i.test(ua) || esIpad) return 'ios'
  if (/Win/i.test(plat) || /Windows/i.test(ua)) return 'windows'
  if (/Mac/i.test(plat) && !esIpad) return 'mac'
  if (/Linux/i.test(plat) || /Linux/i.test(ua)) return 'linux'
  return 'other'
}

export function isMobileWeb() {
  const p = getPlataforma()
  return p === 'iosweb' || p === 'androidweb'
}

export function platformLabel(p: PlatformKind = getPlataforma()): string {
  switch (p) {
    case 'iosweb':
      return 'iPhone / iPad'
    case 'androidweb':
      return 'Android'
    default:
      return 'Escritorio / web'
  }
}

/** Texto de ayuda cuando el GPS está bloqueado, según SO (primer plano / segundo plano). */
export function locationHelpForOS(os: DeviceOS = getDeviceOS()): string {
  switch (os) {
    case 'ios':
      return 'iPhone: Ajustes → Safari (o Chrome) → Ubicación → Permitir. Para seguir en segundo plano deja la app abierta o añade a Inicio; iOS limita GPS en pestaña en segundo plano.'
    case 'android':
      return 'Android: candado/info de la URL → Permisos → Ubicación → Permitir. Ideal: “Permitir todo el tiempo” y no cerrar la pestaña; Chrome limita GPS si la app está en segundo plano.'
    case 'mac':
      return 'Mac: Ajustes del Sistema → Privacidad y seguridad → Ubicación → permite el navegador.'
    case 'windows':
      return 'Windows: Configuración → Privacidad → Ubicación → permite el navegador.'
    default:
      return 'Activa la ubicación en el navegador (primer plano). En segundo plano la web suele pausar el GPS; deja la pestaña abierta.'
  }
}

export function mapsAppLabel(os: DeviceOS = getDeviceOS()): string {
  if (os === 'ios') return 'Apple Maps'
  if (os === 'android') return 'Google Maps'
  return 'Google Maps'
}
