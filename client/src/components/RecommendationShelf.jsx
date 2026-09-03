import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from './ErrorState.jsx'
import { LoadingState } from './LoadingState.jsx'
import { ProductImage } from './ProductImage.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { formatMoney, formatRating } from '../utils/format.js'

/**
 * A shelf of recommendations that shows why each one is here. The reasons come
 * from the server; the UI never invents an explanation of its own.
 */
export function RecommendationShelf({ title, fetcher, emptyLabel, showReasons = true }) {
  const load = useCallback(() => fetcher(), [fetcher])
  const { data, status, error, reload } = useApiQuery(load, null)

  if (status === 'loading' || status === 'idle') return <LoadingState label={`Loading ${title}`} />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const items = data?.items ?? []
  if (items.length === 0) {
    return emptyLabel ? <p className="shelf-empty">{emptyLabel}</p> : null
  }

  return (
    <section className="rec-shelf">
      <div className="shelf-head">
        <h3>{title}</h3>
        {data?.personalised === false && (
          <span className="shelf-note">Based on what&rsquo;s popular</span>
        )}
      </div>

      <ul className="shelf-grid">
        {items.map((item) => (
          <li key={item.productId} className="shelf-card">
            <Link to={`/products/${item.productId}`} className="shelf-image">
              <ProductImage
                url={item.imageUrl}
                alt={item.title}
                label={item.title}
                seed={item.productId}
                loading="lazy"
              />
            </Link>
            <div className="shelf-body">
              <Link to={`/products/${item.productId}`} className="shelf-title">
                {item.title}
              </Link>
              <div className="shelf-meta">
                <strong>{formatMoney(item.priceMinor, item.currency)}</strong>
                {item.ratingCount > 0 && (
                  <span>
                    {formatRating(item.ratingAverage)} / 5 ({item.ratingCount})
                  </span>
                )}
              </div>
              {showReasons && item.reasons?.length > 0 && (
                <ul className="reason-list">
                  {item.reasons.slice(0, 2).map((reason) => (
                    <li key={reason.code} className="reason">
                      {reason.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
