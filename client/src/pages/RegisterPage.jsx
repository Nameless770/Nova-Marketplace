import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { GoogleSignInButton } from '../components/GoogleSignInButton.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useAuth } from '../context/useAuth.js'

const emptyDetails = { firstName: '', lastName: '', email: '', password: '' }

export function RegisterPage() {
  const { register, status, error } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [details, setDetails] = useState(emptyDetails)
  const [passwordError, setPasswordError] = useState(null)

  function update(field, value) {
    setDetails((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (details.password.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    setPasswordError(null)
    try {
      await register(details)
      navigate(location.state?.from || '/', { replace: true })
    } catch {
      // The context exposes the request error for the form state.
    }
  }

  if (status === 'loading') return <LoadingState label="Creating your account" />

  return (
    <section className="auth-panel">
      <p className="eyebrow">Your account</p>
      <h2>Create your account.</h2>
      <form onSubmit={submit}>
        <label>
          First name
          <input
            value={details.firstName}
            onChange={(event) => update('firstName', event.target.value)}
            required
          />
        </label>
        <label>
          Last name
          <input
            value={details.lastName}
            onChange={(event) => update('lastName', event.target.value)}
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={details.email}
            onChange={(event) => update('email', event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            minLength={8}
            value={details.password}
            onChange={(event) => update('password', event.target.value)}
            required
          />
        </label>
        {(passwordError || error) && <ErrorState message={passwordError || error} />}
        <button className="primary-action" type="submit">
          Create account
        </button>
      </form>
      <GoogleSignInButton label="Sign up with Google" />
      <p className="auth-alternate">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  )
}
