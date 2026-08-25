import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState.jsx'
import { useAuth } from '../context/useAuth.js'

export function ProtectedRoute() {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingState label="Checking account" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
