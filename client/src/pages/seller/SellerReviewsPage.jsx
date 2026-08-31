import { useCallback } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { sellerApi } from '../../services/api.js'
import { formatRating } from '../../utils/format.js'

export function SellerReviewsPage() {
  const load = useCallback(() => sellerApi.getReviews(), [])
  const { data, status, error, reload } = useApiQuery(load, null)

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading reviews" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const reviews = data?.items ?? []
  const summary = data?.ratingSummary ?? {}

  return (
    <section>
      <p className="eyebrow">Reviews</p>
      <h2>Customer feedback</h2>
      <p className="seller-subtle">
        Store rating <strong>{formatRating(summary.ratingAverage)}</strong> / 5 ·{' '}
        {summary.ratingCount ?? 0} {summary.ratingCount === 1 ? 'review' : 'reviews'}
      </p>

      {reviews.length === 0 ? (
        <p className="seller-subtle">No published reviews yet.</p>
      ) : (
        <ul className="review-list">
          {reviews.map((review) => (
            <li key={review._id} className="review-item">
              <div className="review-head">
                <span className="review-stars">
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(Math.max(0, 5 - review.rating))}
                </span>
                {review.verifiedPurchase && (
                  <span className="review-verified">Verified purchase</span>
                )}
              </div>
              <span className="seller-subtle">{review.productTitle}</span>
              {review.title && <strong className="review-title">{review.title}</strong>}
              <p className="review-text">{review.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
