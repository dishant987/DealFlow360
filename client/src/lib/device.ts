/** "Chrome on Windows" from a user-agent string; good enough to recognise your own devices. */
export function deviceName(ua: string | null): string {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS'
  return `${browser} on ${os}`
}

export type Session = {
  id: string
  userAgent: string | null
  ip: string | null
  createdAt: string
  lastSeenAt: string
  revokedAt?: string | null
  current?: boolean
}
