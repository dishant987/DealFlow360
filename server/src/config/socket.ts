import { Server as IOServer } from 'socket.io'
import type { Server as HttpServer } from 'http'

let io: IOServer | null = null

export function initSocket(server: HttpServer) {
  io = new IOServer(server, {
    cors: { origin: 'http://localhost:5173', credentials: true },
  })
  io.on('connection', (socket) => {
    socket.on('disconnect', () => {})
  })
  return io
}

// ponytail: one coarse broadcast instead of per-controller events. Clients refetch
// the affected queries; at this scale that's cheaper than maintaining an event taxonomy.
export function emitChange(payload: { path: string; method: string }) {
  io?.emit('data:changed', payload)
}
