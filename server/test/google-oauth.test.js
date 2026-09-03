import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app.js'
import { resetAllRateLimits } from '../middleware/rateLimit.js'
import { User } from '../models/User.js'
import { createUser } from './factories.js'

/**
 * Google sign-in, with Google itself stubbed at the network boundary.
 *
 * The flow's whole job is to turn a code from a third party into one of our
 * sessions, and everything that can go wrong lives on our side of that line:
 * whether a forged callback is accepted, whether an unverified address can
 * capture an existing account, whether a suspended user gets back in. Stubbing
 * `fetch` exercises all of it without contacting Google.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'

/** Stands in for Google, returning `profile` for any code. */
function stubGoogle(profile, { tokenOk = true } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const href = String(url)
    if (href.startsWith(TOKEN_ENDPOINT)) {
      return tokenOk
        ? new Response(JSON.stringify({ access_token: 'stub-access-token' }), { status: 200 })
        : new Response('{"error":"invalid_grant"}', { status: 400 })
    }
    if (href.startsWith(USERINFO_ENDPOINT)) {
      return new Response(JSON.stringify(profile), { status: 200 })
    }
    throw new Error(`unexpected fetch to ${href}`)
  })
}

/** Starts the flow and returns the state cookie the browser would hold. */
async function startFlow() {
  const response = await request(app).get('/api/v1/auth/google').expect(302)
  const cookie = response.headers['set-cookie']?.find((value) => value.startsWith('oauth_state='))
  const state = decodeURIComponent(cookie.split(';')[0].split('=')[1])
  return { cookie: cookie.split(';')[0], state, location: response.headers.location }
}

const callback = ({ cookie, state, code = 'stub-code' }) =>
  request(app)
    .get('/api/v1/auth/google/callback')
    .query({ code, state })
    .set('Cookie', cookie ?? '')

/** The token the callback hands back, read out of the redirect's fragment. */
const tokenFrom = (response) =>
  new URLSearchParams(response.headers.location.split('#')[1]).get('token')
const errorFrom = (response) =>
  new URLSearchParams(response.headers.location.split('#')[1]).get('error')

beforeEach(() => {
  resetAllRateLimits()
  process.env.GOOGLE_CLIENT_ID = 'stub-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'stub-client-secret'
  process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/v1/auth/google/callback'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_CLIENT_SECRET
})

describe('starting the flow', () => {
  it('sends the visitor to Google with a state it can check later', async () => {
    const { location, state } = await startFlow()
    const url = new URL(location)

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('stub-client-id')
    expect(url.searchParams.get('state')).toBe(state)
    // Identity only: asking for more would mean holding data we never use.
    expect(url.searchParams.get('scope')).toBe('openid email profile')
  })

  it('keeps the state cookie away from scripts', async () => {
    const response = await request(app).get('/api/v1/auth/google').expect(302)
    const cookie = response.headers['set-cookie'].find((value) => value.startsWith('oauth_state='))
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
  })

  it('refuses rather than half-working when Google is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET

    await request(app).get('/api/v1/auth/google').expect(503)
    const enabled = await request(app).get('/api/v1/auth/google/enabled').expect(200)
    expect(enabled.body.data.enabled).toBe(false)
  })
})

describe('completing the flow', () => {
  it('creates an account on first sign-in and returns a usable session', async () => {
    stubGoogle({
      sub: 'google-1',
      email: 'New.Person@example.com',
      email_verified: true,
      given_name: 'New',
      family_name: 'Person',
    })
    const { cookie, state } = await startFlow()
    const response = await callback({ cookie, state }).expect(302)

    const token = tokenFrom(response)
    expect(token).toBeTruthy()
    // The session must actually work, not merely be well-formed.
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(me.body.data.user.email).toBe('new.person@example.com')

    const stored = await User.findOne({ email: 'new.person@example.com' }).select('+googleId')
    expect(stored.googleId).toBe('google-1')
    // Google has already proved the address, so it counts as verified here.
    expect(stored.emailVerifiedAt).toBeTruthy()
  })

  it('returns the session in the fragment, never the query string', async () => {
    stubGoogle({ sub: 'google-2', email: 'frag@example.com', email_verified: true, name: 'Frag' })
    const { cookie, state } = await startFlow()
    const response = await callback({ cookie, state }).expect(302)

    const [path, fragment] = response.headers.location.split('#')
    // A query string reaches the server and lands in access logs; a fragment
    // does not. This is the whole reason for the redirect's shape.
    expect(path).not.toContain('token')
    expect(path).not.toContain('?')
    expect(fragment).toContain('token=')
  })

  it('signs the same person back in without creating a second account', async () => {
    const profile = {
      sub: 'google-3',
      email: 'repeat@example.com',
      email_verified: true,
      name: 'R',
    }
    stubGoogle(profile)

    // Sign in twice, as a returning user would.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { cookie, state } = await startFlow()
      await callback({ cookie, state }).expect(302)
    }
    await expect(User.countDocuments({ email: 'repeat@example.com' })).resolves.toBe(1)
  })

  it('links to an existing password account when Google verified the address', async () => {
    const existing = await createUser({ email: 'both@example.com' })
    stubGoogle({ sub: 'google-4', email: 'both@example.com', email_verified: true, name: 'Both' })

    const { cookie, state } = await startFlow()
    await callback({ cookie, state }).expect(302)

    const stored = await User.findById(existing._id).select('+googleId +passwordHash')
    expect(stored.googleId).toBe('google-4')
    // Linking must not cost them their password.
    expect(stored.passwordHash).toBeTruthy()
    await expect(User.countDocuments({ email: 'both@example.com' })).resolves.toBe(1)
  })
})

describe('attacks on the flow', () => {
  it('rejects a callback whose state does not match the cookie', async () => {
    stubGoogle({ sub: 'evil', email: 'evil@example.com', email_verified: true, name: 'E' })
    const { cookie } = await startFlow()

    // The login-CSRF attack: feeding a victim a callback carrying the attacker's
    // code, to log the victim into the attacker's account.
    const response = await callback({ cookie, state: 'not-the-cookie-value' }).expect(302)
    expect(tokenFrom(response)).toBeNull()
    expect(errorFrom(response)).toMatch(/expired/i)
    await expect(User.countDocuments({ email: 'evil@example.com' })).resolves.toBe(0)
  })

  it('rejects a callback with no state cookie at all', async () => {
    stubGoogle({ sub: 'evil2', email: 'evil2@example.com', email_verified: true, name: 'E' })
    const response = await callback({ cookie: '', state: 'anything' }).expect(302)

    expect(tokenFrom(response)).toBeNull()
    await expect(User.countDocuments({ email: 'evil2@example.com' })).resolves.toBe(0)
  })

  it('will not capture an existing account on an unverified Google address', async () => {
    const victim = await createUser({ email: 'victim@example.com' })
    // Anyone can put any address on a Google account; only `email_verified`
    // says Google checked it. Without this rule that is an account takeover.
    stubGoogle({ sub: 'attacker', email: 'victim@example.com', email_verified: false, name: 'A' })

    const { cookie, state } = await startFlow()
    const response = await callback({ cookie, state }).expect(302)

    expect(tokenFrom(response)).toBeNull()
    const stored = await User.findById(victim._id).select('+googleId')
    expect(stored.googleId).toBeUndefined()
  })

  it('does not let a suspended account back in through Google', async () => {
    await createUser({ email: 'banned@example.com', status: 'suspended' })
    stubGoogle({ sub: 'g-ban', email: 'banned@example.com', email_verified: true, name: 'B' })

    const { cookie, state } = await startFlow()
    const response = await callback({ cookie, state }).expect(302)
    expect(tokenFrom(response)).toBeNull()
  })

  it('reports a refused code exchange instead of signing anyone in', async () => {
    stubGoogle(
      { sub: 'x', email: 'x@example.com', email_verified: true, name: 'X' },
      {
        tokenOk: false,
      },
    )
    const { cookie, state } = await startFlow()
    const response = await callback({ cookie, state }).expect(302)

    expect(tokenFrom(response)).toBeNull()
    expect(errorFrom(response)).toBeTruthy()
  })
})

describe('password login alongside Google', () => {
  it('does not crash or admit anyone when an account has no password', async () => {
    stubGoogle({ sub: 'g-nopw', email: 'nopw@example.com', email_verified: true, name: 'N' })
    const { cookie, state } = await startFlow()
    await callback({ cookie, state }).expect(302)
    vi.restoreAllMocks()

    // bcrypt.compare throws on an undefined hash, which would be a 500 and would
    // also reveal that the address exists.
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nopw@example.com', password: 'Password123!' })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS')
  })
})
