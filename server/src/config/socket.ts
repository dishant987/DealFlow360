import { Server as IOServer } from 'socket.io'
import type { Server as HttpServer } from 'http'
import { corsOrigins } from './env.js'
import { cookieName, verifyToken } from '../utils/token.js'

// Read the session cookie straight from the handshake headers.
export function tokenFromCookie(header: string | undefined): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === cookieName) return decodeURIComponent(v.join('='))
  }
  return null
}

let io: IOServer | null = null

export function initSocket(server: HttpServer) {
  io = new IOServer(server, {
    cors: { origin: corsOrigins(), credentials: true },
  })
  // Only signed-in staff get live updates; the public portal and anonymous
  // visitors are refused at the handshake.
  io.use((socket, next) => {
    try {
      // inside the try: a malformed %-escape makes decodeURIComponent throw
      const token = tokenFromCookie(socket.handshake.headers.cookie)
      if (!token) throw new Error('no session')
      verifyToken(token)
      next()
    } catch {
      next(new Error('unauthenticated'))
    }
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
