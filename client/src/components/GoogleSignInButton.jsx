import { useEffect, useState } from 'react'
import { authApi, apiOrigin } from '../services/api.js'

/**
 * "Continue with Google".
 *
 * A plain link, not a fetch: OAuth needs a full-page navigation so the browser
 * carries cookies to Google and back, and so the address bar shows Google's real
 * domain while credentials are entered. An XHR or an iframe would hide that, and
 * hiding it is exactly what a phishing page does.
 *
 * The button hides itself unless the server says Google is configured, so a
 * deployment without credentials offers a button that cannot work.
 */
export function GoogleSignInButton({ label = 'Continue with Google' }) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    authApi
      .googleEnabled()
      .then((response) => {
        if (!cancelled) setEnabled(Boolean(response.data.data.enabled))
      })
      .catch(() => {
        // Treated as unavailable: showing a button that leads to a 503 is worse
        // than not showing one.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!enabled) return null

  return (
    <>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <a className="google-button" href={`${apiOrigin()}/auth/google`}>
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
          />
        </svg>
        {label}
      </a>
    </>
  )
}
