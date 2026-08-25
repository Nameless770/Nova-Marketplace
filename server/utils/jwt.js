import jwt from 'jsonwebtoken'

export function createAccessToken(user) {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')

  return jwt.sign({ sub: user._id.toString(), role: user.role }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  })
}

export function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return jwt.verify(token, secret)
}
