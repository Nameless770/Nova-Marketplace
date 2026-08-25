import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'

export function Navbar() {
  const { user, logout } = useAuth()

  return (
    <header className="navbar">
      <Link className="brand" to="/">
        NOVA / MARKET
      </Link>
      <nav aria-label="Primary navigation">
        <NavLink to="/products">Explore</NavLink>
        <NavLink to="/categories">Categories</NavLink>
        {user && <NavLink to="/wishlist">Wishlist</NavLink>}
        {user && <NavLink to="/orders">Orders</NavLink>}
      </nav>
      <div className="nav-account">
        {user ? (
          <>
            <span className="account-label">Hi, {user.firstName}</span>
            <Link to="/cart" aria-label="Cart">
              Cart
            </Link>
            <Link to="/profile" aria-label="Profile">
              Profile
            </Link>
            <button type="button" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login">Sign in</Link>
        )}
      </div>
    </header>
  )
}
