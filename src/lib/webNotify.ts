/** Notificaciones del navegador (Web Notification API) */

let permissionAsked = false

export async function ensureWebNotifications(force = false): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  if (permissionAsked && !force) return false
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
      icon: `${import.meta.env.BASE_URL}logo-lopez.png`,
      badge: `${import.meta.env.BASE_URL}favicon.svg`,
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
