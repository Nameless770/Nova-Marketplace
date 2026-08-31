import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { RecommendationShelf } from '../components/RecommendationShelf.jsx'
import { useAuth } from '../context/useAuth.js'
import { recommendationApi } from '../services/api.js'

export function HomePage() {
  const { user } = useAuth()
  const forYou = useCallback(() => recommendationApi.forYou({ limit: 8 }), [])
  const recentlyViewed = useCallback(
    () => recommendationApi.recentlyViewed({ limit: 6 }),
    [],
  )

  return (
    <>
      <section className="hero-panel">
        <p className="eyebrow">A considered marketplace</p>
        <h1>Find things with a little more soul.</h1>
        <p>Explore independent sellers and products selected for the way you live.</p>
        <Link className="primary-action" to="/products">
          Start exploring
        </Link>
      </section>

      {user && (
        <>
          <RecommendationShelf title="Recommended for you" fetcher={forYou} />
          <RecommendationShelf
            title="Pick up where you left off"
            fetcher={recentlyViewed}
            showReasons={false}
          />
        </>
      )}
    </>
  )
}
