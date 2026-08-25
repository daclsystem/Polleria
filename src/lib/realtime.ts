import { io, type Socket } from 'socket.io-client'
import { API_URL } from './api'
import type { Role } from '../types'

export type RealtimeEvent =
  | 'order:created'
  | 'order:updated'
  | 'order:status'
  | 'order:paid'
  | 'order:driver'
  | 'driver:location'
  | 'kitchen:new'
  | 'table:updated'
  | 'reservation:updated'

export type RealtimeRoom = 'ops' | 'cocina' | 'caja' | 'mesas' | 'delivery'

type Handler = (event: RealtimeEvent, payload: unknown) => void

let socket: Socket | null = null
const handlers = new Set<Handler>()
let connected = false
const statusListeners = new Set<(ok: boolean) => void>()
let joinedRooms = new Set<string>()

/** Salas Socket.IO por rol de personal */
export function roomsForStaffRole(role?: Role | string | null): RealtimeRoom[] {
  switch (role) {
    case 'cocina':
      return ['cocina']
    case 'mozo':
      return ['mesas']
    case 'cajero':
      return ['caja', 'mesas']
    case 'admin':
      return ['ops', 'cocina', 'caja', 'mesas', 'delivery']
    default:
      return ['ops']
  }
}

/** ¿Este rol debe ver toast/sonido para el evento? */
export function shouldNotifyRole(
  role: Role | string | null | undefined,
  event: RealtimeEvent,
  status?: string,
): boolean {
  if (!role) return false
  if (role === 'admin') {
    // Admin ve todo excepto el ruido de “→ en_cocina” (ya tiene kitchen:new)
    if (event === 'order:status' && status === 'en_cocina') return false
    return event !== 'order:updated' && event !== 'table:updated' && event !== 'reservation:updated'
  }
  if (role === 'cocina') {
    // Solo comanda nueva de preparación (no duplicar con order:status)
    return event === 'kitchen:new' || (event === 'order:status' && status === 'cancelado')
  }
  if (role === 'mozo') {
    // Solo estados de sus mesas (el filtro por createdByUserId va en StoreContext)
    return (
      (event === 'order:status' &&
        ['en_cocina', 'listo', 'cancelado', 'entregado', 'nuevo'].includes(String(status))) ||
      event === 'order:paid'
    )
  }
  if (role === 'cajero') {
    if (event === 'kitchen:new') return false
    if (event === 'order:status' && status === 'en_cocina') return false
    return (
      event === 'order:created' ||
      event === 'order:paid' ||
      event === 'order:driver' ||
      (event === 'order:status' && ['listo', 'entregado', 'cancelado', 'nuevo'].includes(String(status)))
    )
  }
  if (role === 'driver') {
    return event === 'order:driver' || (event === 'order:status' && (status === 'listo' || status === 'entregado'))
  }
  return false
}

export function isRealtimeConnected() {
  return connected
}

export function onRealtimeStatus(fn: (ok: boolean) => void) {
  statusListeners.add(fn)
  fn(connected)
  return () => statusListeners.delete(fn)
}

function setConnected(ok: boolean) {
  connected = ok
  statusListeners.forEach((fn) => fn(ok))
}

export function onRealtimeEvent(fn: Handler) {
  handlers.add(fn)
  return () => handlers.delete(fn)
}

function emitLocal(event: RealtimeEvent, payload: unknown) {
  handlers.forEach((fn) => {
    try {
      fn(event, payload)
    } catch {
      /* ignore */
    }
  })
}

function applyRooms(rooms: string[]) {
  if (!socket) return
  const next = new Set(rooms)
  for (const r of joinedRooms) {
    if (!next.has(r)) socket.emit('leave', r)
  }
  for (const r of next) {
    if (!joinedRooms.has(r)) socket.emit('join', r)
  }
  joinedRooms = next
}

/** Conecta al Socket.IO del API (path /realtime). Idempotente. */
export function connectRealtime(rooms: string[] = ['ops']) {
  if (!API_URL) return null

  if (socket) {
    applyRooms(rooms)
    return socket
  }

  socket = io(API_URL, {
    path: '/realtime',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1500,
    reconnectionAttempts: Infinity,
  })

  socket.on('connect', () => {
    setConnected(true)
    // Re-join after reconnect
    const list = [...joinedRooms]
    if (list.length) list.forEach((r) => socket!.emit('join', r))
  })
  socket.on('disconnect', () => setConnected(false))
  socket.on('connect_error', () => setConnected(false))

  const events: RealtimeEvent[] = [
    'order:created',
    'order:updated',
    'order:status',
    'order:paid',
    'order:driver',
    'driver:location',
    'kitchen:new',
    'table:updated',
    'reservation:updated',
  ]
  for (const ev of events) {
    socket.on(ev, (payload: unknown) => emitLocal(ev, payload))
  }

  joinedRooms = new Set()
  applyRooms(rooms)

  return socket
}

export function disconnectRealtime() {
  if (!socket) return
  socket.removeAllListeners()
  socket.disconnect()
  socket = null
  joinedRooms = new Set()
  setConnected(false)
}

export function orderLabel(payload: unknown) {
  const o = payload as {
    Number?: number
    number?: number
    CustomerName?: string
    customerName?: string
    Status?: string
    status?: string
    CreatedByUserId?: string
    createdByUserId?: string
    CreatedBy?: string
    createdBy?: string
    Id?: string
    id?: string
  }
  const n = o.Number ?? o.number
  const name = o.CustomerName ?? o.customerName ?? ''
  const status = o.Status ?? o.status
  const createdByUserId = o.CreatedByUserId ?? o.createdByUserId
  const createdBy = o.CreatedBy ?? o.createdBy
  const id = o.Id ?? o.id
  return { n, name, status, createdByUserId, createdBy, id }
}

/** Lee rol staff guardado en sesión local */
export function readStaffRole(): Role | null {
  try {
    const raw = localStorage.getItem('polleria-api-user')
    if (!raw) return null
    const u = JSON.parse(raw) as { role?: Role }
    return u.role || null
  } catch {
    return null
  }
}

export function readStaffUser(): { id?: string; name?: string; role?: Role } | null {
  try {
    const raw = localStorage.getItem('polleria-api-user')
    if (!raw) return null
    return JSON.parse(raw) as { id?: string; name?: string; role?: Role }
  } catch {
    return null
  }
}

/** Pedido tomado por este mozo (por GUID o nombre legacy). */
export function orderBelongsToStaff(
  order: {
    createdByUserId?: string | null
    CreatedByUserId?: string | null
    createdBy?: string | null
    CreatedBy?: string | null
  },
  staff: { id?: string; name?: string } | null | undefined,
): boolean {
  if (!staff?.id && !staff?.name) return false
  const uid = String(order.createdByUserId || order.CreatedByUserId || '').toLowerCase()
  const by = String(order.createdBy || order.CreatedBy || '')
  if (staff.id && uid && uid === staff.id.toLowerCase()) return true
  if (staff.id && by && by.toLowerCase() === staff.id.toLowerCase()) return true
  if (staff.name && by && by === staff.name) return true
  return false
}
