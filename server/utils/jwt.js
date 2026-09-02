import jwt from 'jsonwebtoken'
import { logger } from './logger.js'

const ALGORITHM = 'HS256'
const ISSUER = 'marketplace-api'
const AUDIENCE = 'marketplace-client'
const MIN_SECRET_LENGTH = 32

/**
 * A signing secret that is short or guessable is a complete authentication
 * bypass. This measures the secret rather than comparing it against a list of
 * known placeholders — the likeliest mistake is shipping a dev secret that was
 * never on such a list.
 *
 * Fatal in production; a warning elsewhere, so local development keeps working
 * without weakening the check where it counts.
 */
function secretWeakness(secret) {
  if (secret.length < MIN_SECRET_LENGTH) return `shorter than ${MIN_SECRET_LENGTH} characters`
  if (new Set(secret).size < 12) return 'too few distinct characters to be random'
  if (/^(change|replace|secret|password|local|dev|test|example)/i.test(secret))
    return 'looks like a placeholder'
  return null
}

let secretChecked = false

function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')

  if (!secretChecked) {
    secretChecked = true
    const weakness = secretWeakness(secret)
    if (weakness) {
      const detail = `JWT_SECRET is ${weakness}. Generate one with: openssl rand -base64 48`
      if (process.env.NODE_ENV === 'production') throw new Error(detail)
      logger.warn({ detail }, 'weak JWT secret')
    }
  }
  return secret
}

export function createAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret(), {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  })
}

export function verifyAccessToken(token) {
  // Pinning the algorithm closes algorithm-confusion attacks rather than relying
  // on the library's current default behaviour.
  return jwt.verify(token, jwtSecret(), {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  })
}
