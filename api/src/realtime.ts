import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'

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
  | 'inventory:updated'

let io: Server | null = null

export function initRealtime(httpServer: HttpServer, corsOrigins: string[]) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (
          !origin ||
          corsOrigins.includes(origin) ||
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          cb(null, true)
          return
        }
        cb(null, false)
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
    path: '/realtime',
  })

  io.on('connection', (socket) => {
    socket.on('join', (room: string) => {
      // ops/cocina/... o track:<guid> para seguimiento del cliente
      if (typeof room === 'string' && room.length < 60) {
        socket.join(room)
      }
    })
    socket.on('leave', (room: string) => {
      if (typeof room === 'string') socket.leave(room)
    })
  })

  return io
}

/**
 * Emite a las salas indicadas UNA sola vez por cliente
 * (aunque el socket esté en varias salas a la vez).
 * No hace broadcast global.
 */
export function emitEvent(event: RealtimeEvent, payload: unknown, rooms: string[] = ['ops', 'cocina', 'caja']) {
  if (!io) return
  const unique = [...new Set(rooms.filter(Boolean))]
  if (unique.length === 0) return
  io.to(unique).emit(event, payload)
}

/** Salas según estado del pedido (quién debe enterarse) */
export function roomsForOrderStatus(status: string): string[] {
  switch (status) {
    case 'en_cocina':
      // Cocina + mozos (sala mesas) para avisar “ya está en preparación”
      return ['cocina', 'ops', 'mesas']
    case 'listo':
      return ['mesas', 'caja', 'ops', 'delivery']
    case 'entregado':
      return ['ops', 'caja', 'mesas', 'delivery']
    case 'cancelado':
      return ['ops', 'caja', 'cocina', 'mesas', 'delivery']
    case 'nuevo':
      return ['ops', 'caja', 'cocina', 'mesas']
    default:
      return ['ops', 'caja']
  }
}

export function getIo() {
  return io
}
