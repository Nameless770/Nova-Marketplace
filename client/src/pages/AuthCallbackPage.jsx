import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState.jsx'
import { useAuth } from '../context/useAuth.js'

/**
 * Where Google sends the browser back to.
 *
 * The session arrives in the URL *fragment* rather than the query string, because
 * a fragment is never transmitted to a server: it stays out of access logs, proxy
 * logs and the Referer header of anything this page later loads. It is read once
 * and then erased from the address bar with `replaceState`, so the token does not
 * sit in browser history or get re-used if the page is refreshed.
 */
export function AuthCallbackPage() {
  const { adoptToken } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  // React runs effects twice in development StrictMode. The hash is cleared on
  // the first pass, so without this guard the second pass sees nothing and
  // reports a failure for a sign-in that actually worked.
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = params.get('token')
    const failure = params.get('error')

    // Drop the fragment before doing anything else, so a token never survives in
    // the address bar or in history.
    window.history.replaceState(null, '', window.location.pathname)

    if (token) {
      adoptToken(token)
      navigate('/', { replace: true })
      return
    }
    // Deferred to a microtask: setting state straight from an effect body
    // cascades renders, and this is the codebase's established way around it.
    Promise.resolve().then(() => setError(failure || 'Sign-in did not complete. Please try again.'))
  }, [adoptToken, navigate])

  if (error) {
    return (
      <section className="auth-panel">
        <p className="eyebrow">Your account</p>
        <h2>Sign-in failed.</h2>
        <p className="auth-error">{error}</p>
        <Link className="add-to-cart" to="/login">
          Back to sign in
        </Link>
      </section>
    )
  }

  return <LoadingState label="Finishing sign-in" />
}
