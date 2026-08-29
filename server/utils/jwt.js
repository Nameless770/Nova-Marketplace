import jwt from 'jsonwebtoken'

const placeholderSecrets = new Set(['replace-with-a-long-random-secret', 'change-me'])

function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  if (process.env.NODE_ENV === 'production' && placeholderSecrets.has(secret)) {
    throw new Error('JWT_SECRET must be set to a strong non-placeholder value in production')
  }
  return secret
}

export function createAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  })
}

export function verifyAccessToken(token) {
  return jwt.verify(token, jwtSecret())
}
