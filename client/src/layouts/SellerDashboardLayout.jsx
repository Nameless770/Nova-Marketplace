import { NavLink, Outlet } from 'react-router-dom'

const sections = [
  { to: '/seller', label: 'Overview', end: true },
  { to: '/seller/revenue', label: 'Revenue' },
  { to: '/seller/orders', label: 'Orders' },
  { to: '/seller/products', label: 'Products' },
  { to: '/seller/inventory', label: 'Inventory' },
  { to: '/seller/reviews', label: 'Reviews' },
  { to: '/seller/store', label: 'Store profile' },
  { to: '/seller/notifications', label: 'Notifications' },
]

export function SellerDashboardLayout() {
  return (
    <div className="seller-shell">
      <aside className="seller-nav">
        <p className="eyebrow">Seller centre</p>
        <nav aria-label="Seller dashboard sections">
          {sections.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.end}>
              {section.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="seller-content">
        <Outlet />
      </div>
    </div>
  )
}
