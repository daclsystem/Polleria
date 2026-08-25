/** Notificaciones del navegador (Web Notification API) */

let permissionAsked = false

export async function ensureWebNotifications(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  if (permissionAsked) return false
  permissionAsked = true
  try {
    const p = await Notification.requestPermission()
    return p === 'granted'
  } catch {
    return false
  }
}

export function notifyWeb(title: string, body: string, opts?: { tag?: string; onClick?: () => void }) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      tag: opts?.tag || 'polleria',
      icon: '/polleria/logo-lopez.png',
      badge: '/polleria/favicon.svg',
    })
    n.onclick = () => {
      window.focus()
      opts?.onClick?.()
      n.close()
    }
  } catch {
    /* ignore */
  }
}
