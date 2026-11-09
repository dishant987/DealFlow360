import { describe, expect, it } from 'vitest'
import { customerWriteRule } from './customer.controller.js'

const rep = { id: 'rep-1', role: 'rep' }
const mgr = { id: 'mgr-1', role: 'manager' }

describe('customerWriteRule', () => {
  it("a rep's new customer is theirs and starts at bronze", () => {
    const r = customerWriteRule(rep, 'POST', { name: 'A', email: 'a@x.com', tier: 'gold', ownerId: 'someone-else' })
    expect(r).toEqual({ ok: true, body: { name: 'A', email: 'a@x.com', tier: 'bronze', ownerId: 'rep-1' } })
  })

  it('a rep edits only customers they own', () => {
    expect(customerWriteRule(rep, 'PATCH', { phone: '1' }, 'rep-1')).toEqual({ ok: true, body: { phone: '1' } })
    expect(customerWriteRule(rep, 'PATCH', { phone: '1' }, 'rep-2')).toMatchObject({ ok: false, status: 403 })
    expect(customerWriteRule(rep, 'PATCH', { phone: '1' }, null)).toMatchObject({ ok: false, status: 403 })
  })

  it("a rep can't change tier or reassign, even on their own customer", () => {
    expect(customerWriteRule(rep, 'PATCH', { tier: 'gold' }, 'rep-1')).toMatchObject({ ok: false, status: 403 })
    expect(customerWriteRule(rep, 'PATCH', { ownerId: 'rep-2' }, 'rep-1')).toMatchObject({ ok: false, status: 403 })
  })

  it('managers and admins edit anything and keep what they send', () => {
    expect(customerWriteRule(mgr, 'PATCH', { tier: 'gold', ownerId: 'rep-2' }, 'rep-1')).toEqual({
      ok: true,
      body: { tier: 'gold', ownerId: 'rep-2' },
    })
    expect(customerWriteRule(mgr, 'POST', { name: 'B', tier: 'silver' })).toEqual({ ok: true, body: { name: 'B', tier: 'silver' } })
  })
})
