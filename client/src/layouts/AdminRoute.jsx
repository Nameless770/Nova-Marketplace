import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState.jsx'
import { useAuth } from '../context/useAuth.js'

// Convenience guard mirroring the server's authorize('admin'). Every admin
// request is independently authorised server-side.
export function AdminRoute() {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingState label="Checking admin access" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== 'admin') {
    return (
      <section className="empty-state">
        <p className="eyebrow">Admin area</p>
        <h2>You do not have access to this area.</h2>
      </section>
    )
  }
  return <Outlet />
}
