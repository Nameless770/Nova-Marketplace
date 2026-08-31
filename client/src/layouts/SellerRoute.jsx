import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState.jsx'
import { useAuth } from '../context/useAuth.js'

// Mirrors the server's authorize('seller') rule. This is a convenience guard
// only — the API remains the security boundary for every seller request.
export function SellerRoute() {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingState label="Checking seller access" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== 'seller' || user.sellerApprovalStatus !== 'approved') {
    return (
      <section className="empty-state">
        <p className="eyebrow">Seller area</p>
        <h2>This area is for approved sellers.</h2>
        <p>
          {user.sellerApprovalStatus === 'pending'
            ? 'Your seller application is still under review.'
            : 'Apply to become a seller to open your store dashboard.'}
        </p>
      </section>
    )
  }
  return <Outlet />
}
