import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="empty-state">
      <p className="eyebrow">404</p>
      <h2>That page is not here.</h2>
      <Link className="primary-action" to="/">
        Return home
      </Link>
    </section>
  )
}
