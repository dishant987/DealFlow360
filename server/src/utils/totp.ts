import crypto from 'crypto'

// RFC 6238 TOTP (the codes authenticator apps show) on Node's crypto; no dependency.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error('invalid base32')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const generateSecret = () => base32Encode(crypto.randomBytes(20))

export function totp(secret: string, at = Date.now(), digits = 6): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const o = h[h.length - 1] & 15
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits
  return String(n).padStart(digits, '0')
}

// ±1 step (30 s) tolerates a phone clock that is slightly off.
// shortcut: a code can be reused within its 90 s window; store the last used step if that matters
export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const c = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(c)) return false
  return [-1, 0, 1].some((step) =>
    crypto.timingSafeEqual(Buffer.from(totp(secret, at + step * 30_000)), Buffer.from(c)),
  )
}

export const otpauthUri = (secret: string, email: string) =>
  `otpauth://totp/Dealwise:${encodeURIComponent(email)}?secret=${secret}&issuer=Dealwise&algorithm=SHA1&digits=6&period=30`

// Recovery codes: shown once, stored only as hashes, each usable once.
export const hashCode = (code: string) =>
  crypto.createHash('sha256').update(code.replace(/[\s-]/g, '').toLowerCase()).digest('hex')
export function generateRecoveryCodes(n = 10) {
  const codes = Array.from({ length: n }, () => {
    const hex = crypto.randomBytes(5).toString('hex')
    return `${hex.slice(0, 5)}-${hex.slice(5)}`
  })
  return { codes, hashes: codes.map(hashCode) }
}

// The TOTP secret is stored encrypted (AES-256-GCM) so a database leak alone
// doesn't hand out everyone's second factor.
const key = () =>
  crypto
    .createHash('sha256')
    .update(`${process.env.JWT_SECRET || 'dev-secret-change-me'}:mfa`)
    .digest()
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.')
}
export function decryptSecret(stored: string): string {
  const [iv, tag, enc] = stored.split('.').map((s) => Buffer.from(s, 'base64'))
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}
