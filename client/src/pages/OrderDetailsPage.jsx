import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { OrderTracker } from '../components/OrderTracker.jsx'
import { ReviewForm } from '../components/ReviewForm.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { ORDER_STATUS_LABELS } from '../utils/orderStatus.js'
import { orderApi, reviewApi } from '../services/api.js'
import { formatMoney, variantLabel } from '../utils/format.js'

export function OrderDetailsPage() {
  const { orderId } = useParams()
  const load = useCallback(() => orderApi.get(orderId), [orderId])
  const { data, status, error, reload } = useApiQuery(load, {})

  // The customer's own reviews for the products on this order, keyed by product.
  // Fetched separately because a freshly written review is `pending`, so it does
  // not appear in the public list the product page reads.
  const [reviews, setReviews] = useState({})
  // Nothing is offered until this settles. The form reads its initial rating and
  // text from the review passed to it, so rendering before the lookup returns
  // would show an empty form for a product already reviewed.
  const [reviewsLoaded, setReviewsLoaded] = useState(false)
  const order = data?.order
  const items = data?.items
  const delivered = order?.status === 'delivered'

  useEffect(() => {
    if (!delivered || !items?.length) return undefined
    let cancelled = false
    const ids = [...new Set(items.map((item) => String(item.productId)).filter(Boolean))]
    if (!ids.length) return undefined
    reviewApi
      .mine(ids.join(','))
      .then((response) => {
        if (cancelled) return
        const byProduct = {}
        for (const review of response.data.data.items ?? []) {
          byProduct[String(review.productId)] = review
        }
        setReviews(byProduct)
      })
      // A failure here only costs the "already reviewed" hint; submitting still
      // works and the API rejects a genuine duplicate on its own.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReviewsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [delivered, items])

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading order" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  if (!order) return <div className="empty-state">Order not found.</div>

  return (
    <section>
      <p className="eyebrow">Order {order.orderNumber}</p>
      <h2>{ORDER_STATUS_LABELS[order.status] ?? order.status}</h2>
      <p className="order-total">{formatMoney(order.totalMinor, order.currency)}</p>
      <OrderTracker status={order.status} statusHistory={order.statusHistory} />
      {delivered && (
        <p className="review-prompt">
          Your order arrived — rate what you bought to help other shoppers.
        </p>
      )}
      <div className="stack-list">
        {(items || []).map((item) => (
          <article className={`line-item${delivered ? ' order-line' : ''}`} key={item._id}>
            <div className="line-item-main">
              <div>
                <h3>{item.productSnapshot?.title}</h3>
                <span>
                  {variantLabel(item.variantSnapshot)} · Quantity {item.quantity}
                </span>
              </div>
              <strong>{formatMoney(item.lineTotalMinor, order.currency)}</strong>
            </div>
            {/* Reviewing is offered once the goods have actually arrived. */}
            {delivered && item.productId && reviewsLoaded && (
              <ReviewForm
                // Keyed on the existing review so that arriving late — or being
                // written for the first time — remounts the form and lets it
                // re-read its initial rating and text from the new prop.
                key={reviews[String(item.productId)]?._id ?? 'new'}
                productId={String(item.productId)}
                productTitle={item.productSnapshot?.title ?? 'this product'}
                existing={reviews[String(item.productId)]}
                onSaved={(review) =>
                  setReviews((current) => ({ ...current, [String(item.productId)]: review }))
                }
              />
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
