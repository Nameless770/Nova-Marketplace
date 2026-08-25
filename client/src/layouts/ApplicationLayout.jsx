import { Outlet } from 'react-router-dom'
import { Footer } from '../components/Footer.jsx'
import { Navbar } from '../components/Navbar.jsx'

export function ApplicationLayout() {
  return (
    <div className="app-frame">
      <Navbar />
      <main className="page-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
