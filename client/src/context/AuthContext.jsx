import { useCallback } from 'react'
import { useEffect, useState } from 'react'
import { authApi, setAccessToken } from '../services/api.js'
import { AuthContext } from './authContextValue.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    setAccessToken(token)
  }, [token])

  async function authenticate(action, values) {
    setStatus('loading')
    setError(null)
    try {
      const response = await action(values)
      const data = response.data.data
      setToken(data.accessToken)
      setUser(data.user)
      setStatus('authenticated')
      return data
    } catch (requestError) {
      setStatus('error')
      setError(requestError.message)
      throw requestError
    }
  }

  async function login(credentials) {
    return authenticate(authApi.login, credentials)
  }

  async function register(details) {
    return authenticate(authApi.register, details)
  }

  const loadCurrentUser = useCallback(async () => {
    if (!token) return
    setStatus('loading')
    try {
      const response = await authApi.getCurrentUser()
      setUser(response.data.data.user)
      setStatus('authenticated')
    } catch (requestError) {
      setToken(null)
      setUser(null)
      setStatus('unauthenticated')
      setError(requestError.message)
    }
  }, [token])

  useEffect(() => {
    const task = Promise.resolve().then(loadCurrentUser)
    return () => task.catch(() => {})
  }, [loadCurrentUser])

  async function logout() {
    try {
      if (token) await authApi.logout()
    } catch {
      // Local token disposal still completes logout if the API is unavailable.
    } finally {
      setAccessToken(null)
      setToken(null)
      setUser(null)
      setStatus('unauthenticated')
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, status, error, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
