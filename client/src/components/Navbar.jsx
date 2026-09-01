import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import { useCart } from '../context/useCart.js'

export function Navbar() {
  const { user, logout } = useAuth()
  const { count } = useCart()
  // Cart, wishlist and orders are customer-only on the API. Showing them to a
  // seller or admin offers an action the server will refuse.
  const isShopper = user?.role === 'customer'

  return (
    <header className="navbar">
      <Link className="brand" to="/">
        NOVA / MARKET
      </Link>
      <nav aria-label="Primary navigation">
        <NavLink to="/products">Explore</NavLink>
        <NavLink to="/categories">Categories</NavLink>
        {isShopper && <NavLink to="/wishlist">Wishlist</NavLink>}
        {isShopper && <NavLink to="/orders">Orders</NavLink>}
        {user?.role === 'seller' && user.sellerApprovalStatus === 'approved' && (
          <NavLink to="/seller">Seller centre</NavLink>
        )}
        {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      <div className="nav-account">
        {user ? (
          <>
            <span className="account-label">Hi, {user.firstName}</span>
            {isShopper && (
              <Link className="cart-icon" to="/cart" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="9" cy="20" r="1.4" />
                  <circle cx="18" cy="20" r="1.4" />
                  <path d="M2.5 3.5h2.2l2.2 11.2a1.8 1.8 0 0 0 1.8 1.4h8.3a1.8 1.8 0 0 0 1.8-1.4L21.5 7H6" />
                </svg>
                {count > 0 && <span className="cart-badge">{count}</span>}
              </Link>
            )}
            <Link to="/profile" aria-label="Profile">
              Profile
            </Link>
            <button type="button" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Create account</Link>
          </>
        )}
      </div>
    </header>
  )
}
