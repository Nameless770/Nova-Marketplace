import { NavLink, Outlet } from 'react-router-dom'

const sections = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/sellers', label: 'Sellers' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/coupons', label: 'Coupons' },
  { to: '/admin/categories', label: 'Categories' },
]

export function AdminDashboardLayout() {
  return (
    <div className="seller-shell">
      <aside className="seller-nav">
        <p className="eyebrow">Admin</p>
        <nav aria-label="Admin dashboard sections">
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
