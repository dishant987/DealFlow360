import { useCallback, useEffect, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const IDLE_MS = 3 * 60 * 1000 // signed out after 3 minutes without activity
const WARN_MS = 30 * 1000 // ...with a 30-second warning first
const KEY = 'dealwise.lastActivity' // shared by every open tab, so activity in one keeps all signed in

const readLast = () => {
  try {
    return Number(localStorage.getItem(KEY)) || Date.now()
  } catch {
    return Date.now()
  }
}
const writeLast = (t: number) => {
  try {
    localStorage.setItem(KEY, String(t))
  } catch {
    /* private mode: this tab still times out on its own */
  }
}

/** End the session and forget everything cached, so nothing leaks into the next sign-in. */
export async function signOut(qc: QueryClient) {
  await api.post('/auth/logout').catch(() => undefined) // still sign out locally if the server is down
  qc.clear()
  qc.setQueryData(['me'], null)
}

/**
 * Signs the person out after IDLE_MS without mouse, keyboard, touch or scroll activity.
 * Returns the seconds left once the warning period starts (null before), and `stay` to keep going.
 */
export function useIdleLogout(enabled: boolean) {
  const qc = useQueryClient()
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const stay = useCallback(() => {
    writeLast(Date.now())
    setSecondsLeft(null)
  }, [])

  useEffect(() => {
    if (!enabled) return
    writeLast(Date.now())
    let lastWrite = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastWrite < 5000) return // mousemove fires constantly; a write every 5 s is plenty
      lastWrite = now
      writeLast(now)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))

    const tick = setInterval(() => {
      const idle = Date.now() - readLast()
      if (idle >= IDLE_MS) {
        clearInterval(tick)
        // a full load, not nav(): clearing the session unmounts this hook before a nav() would run
        void signOut(qc).then(() => window.location.replace('/login?reason=idle'))
      } else if (idle >= IDLE_MS - WARN_MS) setSecondsLeft(Math.ceil((IDLE_MS - idle) / 1000))
      else setSecondsLeft(null)
    }, 1000)

    return () => {
      clearInterval(tick)
      events.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [enabled, qc])

  return { secondsLeft, stay }
}
