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

// One coarse broadcast instead of per-controller events. Clients refetch the
// affected queries; at this scale that's cheaper than maintaining an event
// taxonomy.
//
// Coalesced, though: the raw signal is one frame per mutation to every connected
// client, so a rep adding ten lines — or an approver working down a queue — put
// out a burst of frames that all say the same thing ("something changed, go
// look"). One trailing frame per window carries exactly as much information.
const BURST_MS = 250
let pending: { path: string; method: string } | null = null
let timer: NodeJS.Timeout | null = null

export function emitChange(payload: { path: string; method: string }) {
  if (!io) return
  pending = payload
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    const p = pending
    pending = null
    if (p) io?.emit('data:changed', p)
  }, BURST_MS)
}
