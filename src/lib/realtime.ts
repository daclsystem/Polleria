import { io, type Socket } from 'socket.io-client'
import { API_URL } from './api'

export type RealtimeEvent =
  | 'order:created'
  | 'order:updated'
  | 'order:status'
  | 'order:paid'
  | 'order:driver'
  | 'kitchen:new'
  | 'table:updated'
  | 'reservation:updated'

type Handler = (event: RealtimeEvent, payload: unknown) => void

let socket: Socket | null = null
const handlers = new Set<Handler>()
let connected = false
const statusListeners = new Set<(ok: boolean) => void>()

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

/** Conecta al Socket.IO del API (path /realtime). Idempotente. */
export function connectRealtime(rooms: string[] = ['ops', 'cocina', 'caja', 'mesas', 'delivery']) {
  if (!API_URL) return null
  if (socket) {
    rooms.forEach((r) => socket!.emit('join', r))
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
    rooms.forEach((r) => socket!.emit('join', r))
  })
  socket.on('disconnect', () => setConnected(false))
  socket.on('connect_error', () => setConnected(false))

  const events: RealtimeEvent[] = [
    'order:created',
    'order:updated',
    'order:status',
    'order:paid',
    'order:driver',
    'kitchen:new',
    'table:updated',
    'reservation:updated',
  ]
  for (const ev of events) {
    socket.on(ev, (payload: unknown) => emitLocal(ev, payload))
  }

  return socket
}

export function disconnectRealtime() {
  if (!socket) return
  socket.removeAllListeners()
  socket.disconnect()
  socket = null
  setConnected(false)
}

export function orderLabel(payload: unknown) {
  const o = payload as { Number?: number; number?: number; CustomerName?: string; customerName?: string; Status?: string; status?: string }
  const n = o.Number ?? o.number
  const name = o.CustomerName ?? o.customerName ?? ''
  const status = o.Status ?? o.status
  return { n, name, status }
}
