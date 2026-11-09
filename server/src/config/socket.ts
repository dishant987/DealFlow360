import { Server as IOServer } from 'socket.io'
import type { Server as HttpServer } from 'http'
import { corsOrigins } from './env.js'
import { cookieName, verifyToken } from '../utils/token.js'
import { eq } from 'drizzle-orm'
import { db } from './db.js'
import { users } from '../models/schema.js'

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
      const { id } = verifyToken(token)
      // join the company's room so change signals never cross companies
      void db
        .select({ org: users.organizationId, blocked: users.blocked })
        .from(users)
        .where(eq(users.id, id))
        .then(([u]) => {
          if (!u || u.blocked) return next(new Error('unauthenticated'))
          socket.data.orgId = u.org
          next()
        }, () => next(new Error('unauthenticated')))
    } catch {
      next(new Error('unauthenticated'))
    }
  })
  io.on('connection', (socket) => {
    socket.join(`org:${socket.data.orgId}`)
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
