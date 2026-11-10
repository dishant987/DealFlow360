import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
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
// ...and throttle: a busy company (or a test run) changes data every second, which made open
// dashboards jump constantly. A screen refreshes from live events at most this often.
const MIN_GAP_MS = 10_000
// settings-type data that other people's edits never change
const NOT_LIVE = new Set(['me', 'plan', 'company', 'auth-providers', 'my-sessions'])

export function useLiveUpdates() {
  const qc = useQueryClient()
  // the server refuses anonymous sockets, so connect only once signed in and
  // reconnect when the session changes (login, logout, switch user)
  // Observe the session cache without fetching it: calling /auth/me from here
  // would 401 on every public page (login, portal).
  // Read the cache directly instead of observing ['me'] with a placeholder queryFn: such an observer
  // made React Query log "invoke queryFn when set to skipToken" whenever the session was refreshed.
  const [userId, setUserId] = useState(() => (qc.getQueryData(['me']) as User | null | undefined)?.id)
  useEffect(
    () =>
      qc.getQueryCache().subscribe((e) => {
        if (e.query.queryKey[0] !== 'me') return
        // the cache can notify while another component renders; update after that render
        queueMicrotask(() => setUserId((qc.getQueryData(['me']) as User | null | undefined)?.id))
      }),
    [qc],
  )

  useEffect(() => {
    if (!userId) return
    // same origin: Vite proxies /socket.io in dev, the reverse proxy does in prod
    const socket = io({ withCredentials: true })
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = () => {
      qc.invalidateQueries({
        type: 'active',
        // never the session or settings-type data — only what other people's edits can change
        predicate: (query) => !NOT_LIVE.has(String(query.queryKey[0])),
        // a backgrounded tab goes stale rather than refetching; react-query
        // picks it up on focus
        refetchType: document.hidden ? 'none' : 'active',
      })
    }

    let last = 0
    socket.on('data:changed', () => {
      clearTimeout(timer)
      // trailing: a burst collapses into one refresh, never sooner than MIN_GAP after the previous one
      timer = setTimeout(
        () => {
          last = Date.now()
          refresh()
        },
        Math.max(BURST_MS, last + MIN_GAP_MS - Date.now()),
      )
    })

    return () => {
      clearTimeout(timer)
      socket.close()
    }
  }, [qc, userId])
}
