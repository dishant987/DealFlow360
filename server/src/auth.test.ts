import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  requireRole,
  generateResetToken,
  hashResetToken,
} from './auth.js'

describe('auth', () => {
  it('hashes and verifies a password', async () => {
    const h = await hashPassword('secret123')
    expect(h).not.toBe('secret123')
    expect(await verifyPassword('secret123', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })

  it('signs and verifies a jwt round-trip', () => {
    const token = signToken({ id: 'u1', role: 'rep', email: 'a@b.com' })
    const decoded = verifyToken(token)
    expect(decoded.id).toBe('u1')
    expect(decoded.role).toBe('rep')
    expect(decoded.email).toBe('a@b.com')
  })

  it('requireRole lets matching role through', () => {
    const next = vi.fn()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
    requireRole('admin')({ user: { id: '1', role: 'admin', email: 'a@b' } } as Request, res, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('requireRole blocks wrong role with 403', () => {
    const next = vi.fn()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
    requireRole('admin')({ user: { id: '1', role: 'rep', email: 'a@b' } } as Request, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('requireRole blocks anonymous with 401', () => {
    const next = vi.fn()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response
    requireRole('admin')({} as Request, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('reset token: raw token hashes to the stored hash, expiry is in the future', () => {
    const { token, hash, expiresAt } = generateResetToken()
    expect(hashResetToken(token)).toBe(hash)
    expect(hashResetToken('someone-elses-token')).not.toBe(hash)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})
