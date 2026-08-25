import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useAuth } from '../context/useAuth.js'

export function LoginPage() {
  const { login, status, error } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function submit(event) {
    event.preventDefault()
    try {
      await login({ email, password })
      navigate(location.state?.from || '/', { replace: true })
    } catch {
      // The context exposes the request error for the form state.
    }
  }

  if (status === 'loading') return <LoadingState label="Signing in" />

  return (
    <section className="auth-panel">
      <p className="eyebrow">Your account</p>
      <h2>Welcome back.</h2>
      <form onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <ErrorState message={error} />}
        <button className="primary-action" type="submit">
          Sign in
        </button>
      </form>
    </section>
  )
}
