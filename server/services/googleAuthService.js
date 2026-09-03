import crypto from 'node:crypto'
import { User } from '../models/User.js'
import { AppError } from '../utils/errors.js'
import { createAccessToken } from '../utils/jwt.js'

/**
 * Sign in with Google, using the OAuth 2.0 authorization-code flow.
 *
 * Authorization code rather than implicit: the code is exchanged server-to-server
 * with the client secret, so no token ever passes through the browser's address
 * bar where it would land in history and referrer headers.
 *
 * No SDK. Google's own guidance is that an ID token received directly from the
 * token endpoint over TLS does not need its signature verified — the channel
 * already authenticates it — so the profile is read from the userinfo endpoint
 * with the access token and the whole flow is two `fetch` calls.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'

export const STATE_COOKIE = 'oauth_state'

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/google/callback'
  return { clientId, clientSecret, redirectUri, enabled: Boolean(clientId && clientSecret) }
}

/** Whether the button should be offered at all — the client asks before showing it. */
export function isGoogleEnabled() {
  return googleConfig().enabled
}

function requireConfig() {
  const config = googleConfig()
  if (!config.enabled) {
    throw new AppError(
      503,
      'GOOGLE_AUTH_UNAVAILABLE',
      'Google sign-in is not configured on this server',
    )
  }
  return config
}

/**
 * The consent-screen URL, plus the state to store in a cookie.
 *
 * `state` is the CSRF defence: without it an attacker can feed a victim a
 * callback URL carrying the attacker's own authorization code and log the victim
 * into the attacker's account. The value is compared against a cookie the
 * browser sends back, so only the browser that started the flow can finish it.
 */
export function buildAuthUrl() {
  const { clientId, redirectUri } = requireConfig()
  const state = crypto.randomBytes(32).toString('base64url')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Only ever asking for identity, so there is no refresh token to store and
    // nothing to keep beyond the moment of sign-in.
    prompt: 'select_account',
  })
  return { url: `${AUTH_ENDPOINT}?${params}`, state }
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = requireConfig()
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) {
    // Google's error body can echo request details; it is not put in the message.
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Could not complete Google sign-in')
  }
  const body = await response.json()
  if (!body.access_token)
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Could not complete Google sign-in')
  return body.access_token
}

async function fetchProfile(accessToken) {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok)
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Could not read your Google profile')
  return response.json()
}

function splitName(profile) {
  const first = profile.given_name?.trim()
  const last = profile.family_name?.trim()
  if (first || last) return { firstName: first || last, lastName: last || first }
  // Google does not guarantee the granular name fields; the display name is the
  // fallback, and the schema requires both parts to be non-empty.
  const parts = String(profile.name || profile.email || 'Google User')
    .trim()
    .split(/\s+/)
  return { firstName: parts[0] || 'Google', lastName: parts.slice(1).join(' ') || 'User' }
}

/**
 * Turns a callback code into one of our own sessions.
 *
 * Linking rule: a Google identity may only attach to an existing local account
 * when Google says the address is verified. Skipping that check is an account
 * takeover — anyone able to create a Google account claiming someone's address
 * could otherwise walk into that person's account here.
 */
export async function signInWithGoogle(code) {
  const profile = await fetchProfile(await exchangeCode(code))
  const googleId = profile.sub
  const email = String(profile.email || '')
    .trim()
    .toLowerCase()
  if (!googleId || !email)
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google did not return an account to sign in')

  // Already linked: the subject id is Google's stable identifier and survives the
  // user changing their address, so it is matched before the email.
  let user = await User.findOne({ googleId })

  if (!user) {
    const byEmail = await User.findOne({ email })
    if (byEmail) {
      if (profile.email_verified !== true) {
        throw new AppError(
          409,
          'GOOGLE_EMAIL_UNVERIFIED',
          'This email already has an account. Sign in with your password, or verify the address with Google first.',
        )
      }
      byEmail.googleId = googleId
      if (!byEmail.emailVerifiedAt) byEmail.emailVerifiedAt = new Date()
      await byEmail.save()
      user = byEmail
    } else {
      const { firstName, lastName } = splitName(profile)
      user = await User.create({
        email,
        googleId,
        firstName,
        lastName,
        // Google has already proved the address, so there is nothing left for
        // this app to verify.
        emailVerifiedAt: profile.email_verified === true ? new Date() : undefined,
      })
    }
  }

  // A suspended or deleted account must not be revived by a second sign-in route.
  if (user.status !== 'active')
    throw new AppError(403, 'ACCOUNT_NOT_ACTIVE', 'This account is not active')

  return {
    accessToken: createAccessToken(user),
    user: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      sellerApprovalStatus: user.sellerApprovalStatus,
    },
  }
}
