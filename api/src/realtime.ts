import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'

export type RealtimeEvent =
  | 'order:created'
  | 'order:updated'
  | 'order:status'
  | 'order:paid'
  | 'order:driver'
  | 'kitchen:new'
  | 'table:updated'
  | 'reservation:updated'

let io: Server | null = null

export function initRealtime(httpServer: HttpServer, corsOrigins: string[]) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
    path: '/realtime',
  })

  io.on('connection', (socket) => {
    socket.on('join', (room: string) => {
      if (typeof room === 'string' && room.length < 40) {
        socket.join(room)
      }
    })
    socket.on('leave', (room: string) => {
      if (typeof room === 'string') socket.leave(room)
    })
  })

  return io
}

export function emitEvent(event: RealtimeEvent, payload: unknown, rooms: string[] = ['ops', 'cocina', 'caja']) {
  if (!io) return
  for (const room of rooms) {
    io.to(room).emit(event, payload)
  }
  io.emit(event, payload)
}

export function getIo() {
  return io
}
