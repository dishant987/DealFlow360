import { describe, expect, it } from 'vitest'
import { tokenFromCookie } from './socket.js'

describe('tokenFromCookie', () => {
  it('finds the session cookie among others', () => {
    expect(tokenFromCookie('a=1; token=abc.def=; b=2')).toBe('abc.def=')
  })
  it('throws on a malformed escape (the handshake treats that as unauthenticated)', () => {
    expect(() => tokenFromCookie('token=%E0')).toThrow()
  })
  it('returns null when absent or no header', () => {
    expect(tokenFromCookie('a=1')).toBeNull()
    expect(tokenFromCookie(undefined)).toBeNull()
    expect(tokenFromCookie('xtoken=1')).toBeNull()
  })
})
