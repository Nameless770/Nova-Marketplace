import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'

export function Navbar() {
  const { user, logout } = useAuth()
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
              <Link to="/cart" aria-label="Cart">
                Cart
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
