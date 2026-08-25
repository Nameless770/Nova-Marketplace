import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <section className="hero-panel">
      <p className="eyebrow">A considered marketplace</p>
      <h1>Find things with a little more soul.</h1>
      <p>Explore independent sellers and products selected for the way you live.</p>
      <Link className="primary-action" to="/products">
        Start exploring
      </Link>
    </section>
  )
}
