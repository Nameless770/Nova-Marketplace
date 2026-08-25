import { useState } from 'react'
import { ErrorState } from '../components/ErrorState.jsx'
import { useAuth } from '../context/useAuth.js'
import { profileApi } from '../services/api.js'

export function ProfilePage() {
  const { user, logout } = useAuth()
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
  })
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  async function save(event) {
    event.preventDefault()
    setError(null)
    try {
      await profileApi.update(form)
      setMessage('Profile updated')
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  async function removeAccount() {
    const password = window.prompt('Enter your password to delete this account')
    if (password) {
      await profileApi.deleteAccount(password)
      await logout()
    }
  }
  return (
    <section className="auth-panel">
      <p className="eyebrow">Your details</p>
      <h2>Profile</h2>
      <form onSubmit={save}>
        {['firstName', 'lastName', 'phone'].map((field) => (
          <label key={field}>
            {field}
            <input
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            />
          </label>
        ))}
        {message && <div className="success-message">{message}</div>}
        {error && <ErrorState message={error} />}
        <button className="primary-action">Save changes</button>
      </form>
      <div className="account-actions">
        <button className="text-button" onClick={removeAccount}>
          Delete account
        </button>
      </div>
    </section>
  )
}
