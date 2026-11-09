import { describe, expect, it } from 'vitest'
import { portalLinkLive } from './portal.controller.js'

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
