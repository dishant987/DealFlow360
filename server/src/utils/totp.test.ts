import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashCode,
  totp,
  verifyTotp,
} from './totp.js'

// RFC 6238 Appendix B: SHA1 seed "12345678901234567890"; 6-digit codes are the
// last six digits of the published 8-digit values.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totp(RFC_SECRET, 59_000, 8)).toBe('94287082')
    expect(totp(RFC_SECRET, 1_111_111_109_000, 8)).toBe('07081804')
    expect(totp(RFC_SECRET, 2_000_000_000_000, 8)).toBe('69279037')
    expect(totp(RFC_SECRET, 59_000)).toBe('287082')
  })

  it('round-trips base32', () => {
    const buf = Buffer.from('hello dealwise')
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true)
    expect(generateSecret()).toMatch(/^[A-Z2-7]{32}$/)
  })

  it('accepts the current and adjacent steps, rejects others and junk', () => {
    const now = 1_700_000_000_000
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now), now)).toBe(true)
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 30_000), now)).toBe(true)
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 120_000), now)).toBe(false)
    expect(verifyTotp(RFC_SECRET, 'abc123', now)).toBe(false)
    expect(verifyTotp(RFC_SECRET, '', now)).toBe(false)
  })
})

describe('recovery codes and secret storage', () => {
  it('makes 10 distinct codes whose hashes ignore case and dashes', () => {
    const { codes, hashes } = generateRecoveryCodes()
    expect(new Set(codes).size).toBe(10)
    expect(hashCode(codes[0].toUpperCase().replace('-', ''))).toBe(hashes[0])
  })

  it('encrypts the secret and detects tampering', () => {
    const s = generateSecret()
    const stored = encryptSecret(s)
    expect(stored).not.toContain(s)
    expect(decryptSecret(stored)).toBe(s)
    const [iv, tag, enc] = stored.split('.')
    const flipped = Buffer.from(enc, 'base64')
    flipped[0] ^= 1
    expect(() => decryptSecret([iv, tag, flipped.toString('base64')].join('.'))).toThrow()
  })
})
