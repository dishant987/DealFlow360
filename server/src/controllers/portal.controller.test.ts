import { describe, expect, it } from 'vitest'
import { portalLinkLive, quoteExpired } from './portal.controller.js'

describe('portalLinkLive', () => {
  const now = new Date('2026-11-09T12:00:00Z')
  it('is live until the expiry moment', () => {
    expect(portalLinkLive(new Date('2026-12-09T12:00:00Z'), now)).toBe(true)
    expect(portalLinkLive(new Date('2026-11-09T11:59:59Z'), now)).toBe(false)
  })
  it('treats a missing expiry as expired', () => {
    expect(portalLinkLive(null, now)).toBe(false)
  })
})

describe('quoteExpired', () => {
  const now = new Date('2026-11-10T12:00:00Z')
  it('expires after valid-until, and quotes without a date never do', () => {
    expect(quoteExpired(new Date('2026-11-09T00:00:00Z'), now)).toBe(true)
    expect(quoteExpired(new Date('2026-12-10T00:00:00Z'), now)).toBe(false)
    expect(quoteExpired(null, now)).toBe(false)
  })
})
