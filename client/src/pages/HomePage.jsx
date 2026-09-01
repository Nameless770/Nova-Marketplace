import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ProductImage } from '../components/ProductImage.jsx'
import { RecommendationShelf } from '../components/RecommendationShelf.jsx'
import { useAuth } from '../context/useAuth.js'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { catalogApi, recommendationApi } from '../services/api.js'
import { formatMoney } from '../utils/format.js'

// Marketing tiles up top, in the house palette rather than a big-box look.
const PROMOS = [
  {
    kind: 'coral',
    eyebrow: 'The collection',
    title: 'Everything, from independent sellers',
    cta: 'Start exploring',
    to: '/products',
  },
  {
    kind: 'cream',
    eyebrow: 'Community favourites',
    title: 'Top-rated picks',
    cta: 'Shop top rated',
    to: '/products?sort=rating',
  },
  {
    kind: 'dark',
    eyebrow: 'Just landed',
    title: 'The newest additions',
    cta: 'See new arrivals',
    to: '/products?sort=newest',
  },
  {
    kind: 'cream',
    eyebrow: 'Great value',
    title: 'Considered goods, fair prices',
    cta: 'Shop by price',
    to: '/products?sort=price_asc',
  },
]

function PromoBand() {
  return (
    <section className="promo-band" aria-label="Highlights">
      {PROMOS.map((promo) => (
        <Link key={promo.to} to={promo.to} className={`promo-tile promo-${promo.kind}`}>
          <p className="promo-eyebrow">{promo.eyebrow}</p>
          <h2 className="promo-title">{promo.title}</h2>
          <span className="promo-cta">{promo.cta} →</span>
        </Link>
      ))}
    </section>
  )
}

function priceOf(product) {
  return product.currentPriceMinor ?? product.minPriceMinor ?? product.priceMinor
}

function CategoryDealCard({ category }) {
  const load = useCallback(
    () => catalogApi.searchProducts({ categoryId: category._id, limit: 4, sort: 'rating' }),
    [category._id],
  )
  const { data, status } = useApiQuery(load, { items: [] })
  const products = (data?.items ?? []).slice(0, 4)
  const to = `/products?categoryId=${category._id}`

  return (
    <article className="deal-card">
      <Link to={to} className="deal-card-head">
        <h3>{category.name}</h3>
        <span className="deal-chevron" aria-hidden="true">
          ›
        </span>
      </Link>
      {status === 'loading' || status === 'idle' ? (
        <div className="deal-grid deal-grid-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : products.length ? (
        <div className="deal-grid">
          {products.map((product) => (
            <Link key={product._id} to={`/products/${product._id}`} className="deal-thumb">
              <ProductImage
                url={product.images?.[0]?.url}
                alt={product.images?.[0]?.alt}
                label={product.title}
              />
              <span className="deal-price">{formatMoney(priceOf(product), product.currency)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="deal-empty">Nothing here yet.</p>
      )}
      <Link to={to} className="deal-more">
        See more in {category.name}
      </Link>
    </article>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const loadCategories = useCallback(() => catalogApi.getCategories(), [])
  const { data } = useApiQuery(loadCategories, { categories: [] })
  const categories = (data?.categories ?? []).slice(0, 6)
  const forYou = useCallback(() => recommendationApi.forYou({ limit: 8 }), [])

  return (
    <div className="home">
      <PromoBand />

      <section className="deal-section" aria-label="Deals by category">
        <div className="deal-cards">
          {categories.map((category) => (
            <CategoryDealCard key={category._id} category={category} />
          ))}
        </div>
      </section>

      {user && <RecommendationShelf title="Recommended for you" fetcher={forYou} />}
    </div>
  )
}
