import { describe, expect, it } from 'vitest'
import { validateGoogleClaims } from './google.controller.js'

const AUD = 'client-123.apps.googleusercontent.com'
const good = {
  iss: 'https://accounts.google.com',
  aud: AUD,
  exp: 2_000_000_000,
  email: 'Riya@Example.com',
  email_verified: true,
}

describe('validateGoogleClaims', () => {
  it('accepts a valid token and lower-cases the email', () => {
    expect(validateGoogleClaims(good, AUD, 1_900_000_000)).toBe('riya@example.com')
    expect(validateGoogleClaims({ ...good, iss: 'accounts.google.com' }, AUD, 1_900_000_000)).toBe('riya@example.com')
  })
  it('rejects another issuer, another app, an expired token or an unverified email', () => {
    expect(validateGoogleClaims({ ...good, iss: 'https://evil.example' }, AUD, 1_900_000_000)).toBeNull()
    expect(validateGoogleClaims({ ...good, aud: 'other-app' }, AUD, 1_900_000_000)).toBeNull()
    expect(validateGoogleClaims(good, AUD, 2_100_000_000)).toBeNull()
    expect(validateGoogleClaims({ ...good, email_verified: false }, AUD, 1_900_000_000)).toBeNull()
    expect(validateGoogleClaims({ ...good, email: undefined }, AUD, 1_900_000_000)).toBeNull()
  })
})
