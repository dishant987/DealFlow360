import { Server as IOServer } from 'socket.io'
import type { Server as HttpServer } from 'http'
import { corsOrigins } from './env.js'
import { cookieName } from '../utils/token.js'
import { loadSession } from '../utils/session.js'

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
    // inside the try: a malformed %-escape makes decodeURIComponent throw
    let token: string | null = null
    try {
      token = tokenFromCookie(socket.handshake.headers.cookie)
    } catch {
      /* treated as no session */
    }
    if (!token) return next(new Error('unauthenticated'))
    // same check as requireAuth: blocked users and signed-out devices are refused
    void loadSession(token).then((s) => {
      if (!s) return next(new Error('unauthenticated'))
      socket.data.orgId = s.orgId
      socket.data.userId = s.claims.id
      socket.data.sid = s.claims.sid
      next()
    }, () => next(new Error('unauthenticated')))
  })
  io.on('connection', (socket) => {
    // join the company's room so change signals never cross companies
    socket.join(`org:${socket.data.orgId}`)
    socket.join(`user:${socket.data.userId}`)
    if (socket.data.sid) socket.join(`session:${socket.data.sid}`)
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
// coalesced per company: each company's room gets its own trailing frame
const pending = new Map<string, { path: string; method: string }>()
let timer: NodeJS.Timeout | null = null

export function emitChange(payload: { path: string; method: string }, orgId: string) {
  if (!io) return
  pending.set(orgId, payload)
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    for (const [org, p] of pending) io?.to(`org:${org}`).emit('data:changed', p)
    pending.clear()
  }, BURST_MS)
}

/** Close live connections when a device is signed out or a user is blocked. */
export function disconnectSockets(userId: string, keepSid?: string, onlySid?: string) {
  if (!io) return
  if (onlySid) return void io.in(`session:${onlySid}`).disconnectSockets(true)
  const room = io.in(`user:${userId}`)
  void (keepSid ? room.except(`session:${keepSid}`) : room).disconnectSockets(true)
}
