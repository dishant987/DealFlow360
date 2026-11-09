import { describe, expect, it } from 'vitest'
import { corsOrigins, prodEnvProblems } from './env.js'

describe('corsOrigins', () => {
  it('defaults to the Vite dev server', () => {
    expect(corsOrigins({})).toEqual(['http://localhost:5173'])
  })
  it('prefers CORS_ORIGINS, trims and drops trailing slashes', () => {
    expect(
      corsOrigins({ CORS_ORIGINS: 'https://a.com/, https://b.com', CLIENT_URL: 'https://x.com' }),
    ).toEqual(['https://a.com', 'https://b.com'])
  })
  it('falls back to CLIENT_URL', () => {
    expect(corsOrigins({ CLIENT_URL: 'https://app.example.com' })).toEqual(['https://app.example.com'])
  })
})

describe('prodEnvProblems', () => {
  const good = {
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(40),
    CLIENT_URL: 'https://app.example.com',
    DATABASE_URL: 'postgres://db',
  }
  it('ignores non-production', () => {
    expect(prodEnvProblems({ NODE_ENV: 'development' })).toEqual([])
  })
  it('accepts a complete production env', () => {
    expect(prodEnvProblems(good)).toEqual([])
  })
  it('rejects the dev default, short secrets and localhost client urls', () => {
    expect(prodEnvProblems({ ...good, JWT_SECRET: 'dev-secret-change-me' })).toHaveLength(1)
    expect(prodEnvProblems({ ...good, JWT_SECRET: 'short' })).toHaveLength(1)
    expect(prodEnvProblems({ ...good, CLIENT_URL: 'http://localhost:5173' })).toHaveLength(1)
    expect(prodEnvProblems({ NODE_ENV: 'production' })).toHaveLength(3)
  })
})
