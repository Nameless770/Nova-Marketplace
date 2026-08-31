import { useCallback } from 'react'
import { useEffect, useState } from 'react'
import { authApi, setAccessToken, setUnauthorizedHandler } from '../services/api.js'
import { AuthContext } from './authContextValue.js'

const tokenStorageKey = 'marketplace.accessToken'

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(tokenStorageKey)
  } catch {
    return null
  }
}

function persistToken(token) {
  try {
    if (token) window.sessionStorage.setItem(tokenStorageKey, token)
    else window.sessionStorage.removeItem(tokenStorageKey)
  } catch {
    // Authentication still works for the current render tree if storage is unavailable.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => readStoredToken())
  const [status, setStatus] = useState(() => (readStoredToken() ? 'loading' : 'unauthenticated'))
  const [error, setError] = useState(null)

  useEffect(() => {
    setAccessToken(token)
    persistToken(token)
  }, [token])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null)
      setToken(null)
      setUser(null)
      setStatus('unauthenticated')
      setError('Your session expired. Please sign in again.')
    })
    return () => setUnauthorizedHandler(null)
  }, [])

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
    if (!token) {
      setUser(null)
      setStatus('unauthenticated')
      return
    }
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
      setError(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, status, error, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
