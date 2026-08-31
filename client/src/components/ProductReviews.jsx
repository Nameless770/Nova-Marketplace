import { useCallback } from 'react'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { reviewApi } from '../services/api.js'
import { formatRating } from '../utils/format.js'
import { ErrorState } from './ErrorState.jsx'
import { LoadingState } from './LoadingState.jsx'

function Stars({ rating }) {
  return (
    <span className="review-stars" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(Math.max(0, 5 - rating))}
    </span>
  )
}

export function ProductReviews({ productId }) {
  const load = useCallback(() => reviewApi.list(productId), [productId])
  const { data, status, error, reload } = useApiQuery(load, null)

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading reviews" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const reviews = data?.items ?? []
  const average = formatRating(data?.ratingSummary?.ratingAverage)
  const count = data?.ratingSummary?.ratingCount ?? 0

  return (
    <section className="review-section">
      <h3>Customer reviews</h3>
      {count > 0 ? (
        <p className="review-summary">
          <strong>{average}</strong> out of 5 · {count} {count === 1 ? 'review' : 'reviews'}
        </p>
      ) : (
        <p className="review-summary">No reviews yet.</p>
      )}
      {reviews.length > 0 && (
        <ul className="review-list">
          {reviews.map((review) => (
            <li key={review._id} className="review-item">
              <div className="review-head">
                <Stars rating={review.rating} />
                {review.verifiedPurchase && (
                  <span className="review-verified">Verified purchase</span>
                )}
              </div>
              {review.title && <strong className="review-title">{review.title}</strong>}
              <p className="review-text">{review.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
