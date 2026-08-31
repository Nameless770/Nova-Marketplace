import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState.jsx'
import { useAuth } from '../context/useAuth.js'

/**
 * Cart, wishlist, orders and checkout are customer-only on the API.
 *
 * Without this, a signed-in seller or admin reaches the page, the request comes
 * back 403, and they are told "Insufficient permissions" — accurate for a
 * developer and useless for everyone else. This explains the situation instead.
 */
export function CustomerRoute() {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingState label="Checking account" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  if (user.role !== 'customer') {
    return (
      <section className="empty-state">
        <p className="eyebrow">Customer account required</p>
        <h2>Shopping lives on customer accounts.</h2>
        <p>
          You are signed in as {user.role === 'admin' ? 'an administrator' : 'a seller'}, so the
          cart, wishlist and order history are not available here. Sign in with a customer account
          to shop.
        </p>
      </section>
    )
  }

  return <Outlet />
}
