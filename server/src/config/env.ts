import 'dotenv/config'

export const isProd = process.env.NODE_ENV === 'production'

// Comma-separated allow-list; falls back to CLIENT_URL, then the Vite dev server.
export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ORIGINS || env.CLIENT_URL || 'http://localhost:5173'
  return raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)
}

const WEAK_SECRETS = new Set(['dev-secret-change-me', 'change-me-to-a-long-random-string'])

// Fail fast at boot rather than run production with a guessable JWT secret or
// portal links that point at localhost. Returns the problems so it can be tested.
export function prodEnvProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return []
  const problems: string[] = []
  const secret = env.JWT_SECRET ?? ''
  if (secret.length < 32 || WEAK_SECRETS.has(secret))
    problems.push('JWT_SECRET must be set to a random string of at least 32 characters')
  if (!env.CLIENT_URL || /localhost|127\.0\.0\.1/.test(env.CLIENT_URL))
    problems.push('CLIENT_URL must be the public URL of the client app')
  if (!env.DATABASE_URL) problems.push('DATABASE_URL is not set')
  return problems
}
