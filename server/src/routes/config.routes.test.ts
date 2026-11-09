import { describe, expect, it } from 'vitest'
import type { Request } from 'express'
import { repCustomerTier } from './config.routes.js'

const run = (role: string, method: string, body: Record<string, unknown>) => {
  const req = { user: { role }, method, body } as unknown as Request
  let status = 0
  const res = { status: (s: number) => ((status = s), { json: () => undefined }) }
  let passed = false
  repCustomerTier(req, res as never, () => (passed = true))
  return { body: req.body, status, passed }
}

describe('repCustomerTier', () => {
  it('forces bronze on a rep-created customer', () => {
    expect(run('rep', 'POST', { name: 'A', email: 'a@x.com', tier: 'gold' }).body.tier).toBe('bronze')
  })
  it('refuses a rep changing a tier, but lets other edits through', () => {
    expect(run('rep', 'PATCH', { tier: 'gold' })).toMatchObject({ status: 403, passed: false })
    expect(run('rep', 'PATCH', { name: 'B' })).toMatchObject({ status: 0, passed: true })
  })
  it('leaves managers and admins free to set tiers', () => {
    expect(run('manager', 'POST', { tier: 'gold' }).body.tier).toBe('gold')
    expect(run('admin', 'PATCH', { tier: 'silver' })).toMatchObject({ passed: true, body: { tier: 'silver' } })
  })
})
