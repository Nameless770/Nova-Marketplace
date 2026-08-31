import request from 'supertest'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { resetAllRateLimits } from '../middleware/rateLimit.js'
import { createAccessToken, verifyAccessToken } from '../utils/jwt.js'
import { authHeader, createUser } from './factories.js'

beforeEach(() => {
  resetAllRateLimits()
})

async function attemptLogin(email, password) {
  return request(app).post('/api/v1/auth/login').send({ email, password })
}

describe('credential brute-force protection', () => {
  it('locks an account after repeated failed passwords', async () => {
    await createUser({ email: 'target@example.com', password: 'Password123!' })

    const statuses = []
    for (let attempt = 0; attempt < 7; attempt += 1) {
      statuses.push((await attemptLogin('target@example.com', 'WrongPassword!')).status)
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses.slice(5)).toEqual([429, 429])
  })

  it('returns Retry-After when locked out', async () => {
    await createUser({ email: 'retry@example.com', password: 'Password123!' })
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await attemptLogin('retry@example.com', 'WrongPassword!')
    }

    const locked = await attemptLogin('retry@example.com', 'WrongPassword!')
    expect(locked.status).toBe(429)
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('locks the guessed account without locking an untouched one', async () => {
    await createUser({ email: 'victim@example.com', password: 'Password123!' })
    await createUser({ email: 'bystander@example.com', password: 'Password123!' })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await attemptLogin('victim@example.com', 'WrongPassword!')
    }

    expect((await attemptLogin('victim@example.com', 'Password123!')).status).toBe(429)
    // A different account is unaffected until the shared IP budget is reached.
    expect((await attemptLogin('bystander@example.com', 'Password123!')).status).toBe(200)
  })

  it('does not count successful logins toward a lockout', async () => {
    await createUser({ email: 'good@example.com', password: 'Password123!' })

    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect((await attemptLogin('good@example.com', 'Password123!')).status).toBe(200)
    }
  })

  it('clears the failure count once the correct password is used', async () => {
    await createUser({ email: 'recover@example.com', password: 'Password123!' })

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await attemptLogin('recover@example.com', 'WrongPassword!')
    }
    expect((await attemptLogin('recover@example.com', 'Password123!')).status).toBe(200)

    // The counter reset, so a fresh run of failures is allowed again.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await attemptLogin('recover@example.com', 'WrongPassword!')).status).toBe(401)
    }
  })

  it('caps password spraying across many accounts from one IP', async () => {
    for (let index = 0; index < 25; index += 1) {
      await createUser({ email: `spray${index}@example.com`, password: 'Password123!' })
    }

    const statuses = []
    for (let index = 0; index < 25; index += 1) {
      statuses.push((await attemptLogin(`spray${index}@example.com`, 'OneGuess!')).status)
    }

    // Each account sees only one failure, so only the per-IP budget can stop this.
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0)
  })

  it('throttles repeated registration attempts', async () => {
    const statuses = []
    for (let index = 0; index < 13; index += 1) {
      const response = await request(app).post('/api/v1/auth/register').send({
        email: `flood${index}@example.com`,
        password: 'Password123!',
        firstName: 'Flood',
        lastName: 'Test',
      })
      statuses.push(response.status)
    }

    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0)
  })
})

describe('JWT hardening', () => {
  it('rejects a token signed with a different algorithm family', async () => {
    const user = await createUser({ role: 'customer' })
    // "alg: none" is the classic algorithm-confusion attack.
    const forged = jwt.sign(
      { sub: user._id.toString(), role: 'admin' },
      '',
      { algorithm: 'none' },
    )

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${forged}`)

    expect(response.status).toBe(401)
  })

  it('rejects a token with the wrong issuer or audience', async () => {
    const user = await createUser({ role: 'customer' })
    const wrongIssuer = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: 'someone-else', audience: 'marketplace-client' },
    )

    expect(() => verifyAccessToken(wrongIssuer)).toThrow()
    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${wrongIssuer}`)
    expect(response.status).toBe(401)
  })

  it('accepts a token this service issued', async () => {
    const user = await createUser({ role: 'customer' })
    const decoded = verifyAccessToken(createAccessToken(user))

    expect(decoded.sub).toBe(user._id.toString())
    expect(decoded.iss).toBe('marketplace-api')
    expect(decoded.aud).toBe('marketplace-client')
  })

  it('rejects a token signed with the wrong secret', async () => {
    const user = await createUser({ role: 'customer' })
    const forged = jwt.sign({ sub: user._id.toString(), role: 'admin' }, 'a-different-secret', {
      algorithm: 'HS256',
      issuer: 'marketplace-api',
      audience: 'marketplace-client',
    })

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${forged}`)

    expect(response.status).toBe(401)
  })
})

describe('password hash containment', () => {
  it('never attaches the password hash to the authenticated request', async () => {
    const user = await createUser({ role: 'customer' })

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', authHeader(user))

    expect(response.status).toBe(200)
    expect(JSON.stringify(response.body)).not.toContain('passwordHash')
    expect(JSON.stringify(response.body)).not.toContain('$2b$')
  })

  it('still allows a password change, which re-reads the hash itself', async () => {
    const user = await createUser({ password: 'Password123!' })

    const response = await request(app)
      .patch('/api/v1/users/me/password')
      .set('Authorization', authHeader(user))
      .send({ currentPassword: 'Password123!', newPassword: 'BrandNewPass123!' })

    // The endpoint returns 204 No Content on success.
    expect(response.status).toBe(204)
    expect((await attemptLogin(user.email, 'BrandNewPass123!')).status).toBe(200)
  })
})
