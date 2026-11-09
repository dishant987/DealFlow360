import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import type { User } from '@/hooks/useAuth'

// The server broadcasts one coarse event per successful mutation, to every
// connected client. Refetching on each one turned a burst of edits into a burst
// of refetches: eleven line-adds by one rep produced twelve /api/summary calls
// on every OTHER rep's idle dashboard — none of which could return different
// data, since that endpoint is scoped to the viewer's own deals.
//
// So coalesce. A trailing debounce collapses a burst into a single refetch, and
// a hidden tab only marks its queries stale so it catches up when the person
// comes back rather than polling in the background.
const BURST_MS = 400

export function useLiveUpdates() {
  const qc = useQueryClient()
  // the server refuses anonymous sockets, so connect only once signed in and
  // reconnect when the session changes (login, logout, switch user)
  // Observe the session cache without fetching it: calling /auth/me from here
  // would 401 on every public page (login, portal).
  const userId = useQuery<User | null>({ queryKey: ['me'], queryFn: skipToken }).data?.id

  useEffect(() => {
    if (!userId) return
    // same origin: Vite proxies /socket.io in dev, the reverse proxy does in prod
    const socket = io({ withCredentials: true })
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = () => {
      qc.invalidateQueries({
        type: 'active',
        // never refetch the session on a data change — that hammered /auth/me
        predicate: (query) => query.queryKey[0] !== 'me',
        // a backgrounded tab goes stale rather than refetching; react-query
        // picks it up on focus
        refetchType: document.hidden ? 'none' : 'active',
      })
    }

    socket.on('data:changed', () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, BURST_MS)
    })

    return () => {
      clearTimeout(timer)
      socket.close()
    }
  }, [qc, userId])
}
