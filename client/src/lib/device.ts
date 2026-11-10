/** "Chrome on Windows" from a user-agent string; good enough to recognise your own devices. */
export function deviceName(ua: string | null): string {
  // no browser signature at all: a script or API client, not a person's browser
  if (!ua || !/Mozilla\//.test(ua)) return 'App or script'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS'
  return os === 'unknown OS' ? browser : `${browser} on ${os}`
}

/** IP for people: loopback reads as "this computer", IPv4-mapped IPv6 loses its prefix. */
export function ipLabel(ip: string | null): string {
  if (!ip) return 'unknown location'
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return 'this computer'
  return ip.replace(/^::ffff:/, '')
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
