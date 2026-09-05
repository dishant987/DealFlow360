import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'

// One shared socket for the app. The server broadcasts on every successful
// mutation; we refetch active queries so dashboards/portals stay live.
export function useLiveUpdates() {
  const qc = useQueryClient()

  useEffect(() => {
    const socket = io('http://localhost:4000', { withCredentials: true })
    socket.on('data:changed', () => {
      // refetch only what's currently mounted; the builder seeds its local
      // state once so in-progress edits are never clobbered.
      qc.invalidateQueries({ type: 'active' })
    })
    return () => {
      socket.close()
    }
  }, [qc])
}
