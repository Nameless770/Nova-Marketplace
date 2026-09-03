import {
  addAddress,
  changePassword,
  deleteAccount,
  deleteAddress,
  getCurrentUser,
  loginUser,
  registerUser,
  updateAccountEmail,
  updateAddress,
  updateProfile,
} from '../services/authService.js'
import {
  buildAuthUrl,
  isGoogleEnabled,
  signInWithGoogle,
  STATE_COOKIE,
} from '../services/googleAuthService.js'
import { AppError } from '../utils/errors.js'

const clientOrigin = () => process.env.CLIENT_ORIGIN || 'http://localhost:5173'

/** Reads one cookie without pulling in a parser for a single value. */
function readCookie(request, name) {
  const header = request.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1))
  }
  return null
}

export function googleEnabled(_request, response) {
  response.json({ success: true, data: { enabled: isGoogleEnabled() } })
}

export function googleStart(request, response) {
  const { url, state } = buildAuthUrl()
  // httpOnly so script on the page cannot read it, sameSite=lax so the browser
  // still sends it on the top-level redirect back from Google.
  response.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
    path: '/api/v1/auth',
  })
  response.redirect(url)
}

/**
 * Google sends the browser here. The session is handed to the SPA in the URL
 * *fragment*, not the query string: a fragment is never sent to a server, so the
 * token stays out of access logs, proxies and Referer headers on the way.
 */
export async function googleCallback(request, response) {
  const done = (params) => response.redirect(`${clientOrigin()}/auth/callback#${params}`)
  response.clearCookie(STATE_COOKIE, { path: '/api/v1/auth' })

  const expected = readCookie(request, STATE_COOKIE)
  const { code, state, error } = request.query
  if (error) return done(`error=${encodeURIComponent('Google sign-in was cancelled')}`)
  // Constant-time compare is overkill for a value the client already holds, but
  // the presence check is not: a missing cookie means this callback did not come
  // from a flow this browser started.
  if (!code || !state || !expected || state !== expected) {
    return done(`error=${encodeURIComponent('Sign-in request expired. Please try again.')}`)
  }

  try {
    const { accessToken } = await signInWithGoogle(String(code))
    return done(`token=${encodeURIComponent(accessToken)}`)
  } catch (requestError) {
    const message =
      requestError instanceof AppError ? requestError.message : 'Could not complete Google sign-in'
    return done(`error=${encodeURIComponent(message)}`)
  }
}

export async function register(request, response) {
  response.status(201).json({ success: true, data: await registerUser(request.body) })
}

export async function login(request, response) {
  response.json({ success: true, data: await loginUser(request.body) })
}

export async function logout(_request, response) {
  response.status(204).send()
}

export async function currentUser(request, response) {
  response.json({ success: true, data: { user: await getCurrentUser(request.user._id) } })
}

export async function updateCurrentProfile(request, response) {
  const user = await updateProfile(request.user._id, request.body)
  response.json({ success: true, data: { user } })
}

export async function updateCurrentAccount(request, response) {
  const user = await updateAccountEmail(
    request.user._id,
    request.body.email,
    request.body.currentPassword,
  )
  response.json({ success: true, data: { user } })
}

export async function updateCurrentPassword(request, response) {
  await changePassword(request.user._id, request.body.currentPassword, request.body.newPassword)
  response.status(204).send()
}

export async function createCurrentAddress(request, response) {
  const address = await addAddress(request.user._id, request.body)
  response.status(201).json({ success: true, data: { address } })
}

export async function updateCurrentAddress(request, response) {
  const address = await updateAddress(request.user._id, request.params.addressId, request.body)
  response.json({ success: true, data: { address } })
}

export async function deleteCurrentAddress(request, response) {
  await deleteAddress(request.user._id, request.params.addressId)
  response.status(204).send()
}

export async function deleteCurrentAccount(request, response) {
  await deleteAccount(request.user._id, request.body.currentPassword)
  response.status(204).send()
}
