import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { orderApi } from '../services/api.js'

export function OrderDetailsPage() {
  const { orderId } = useParams()
  const load = useCallback(() => orderApi.get(orderId), [orderId])
  const { data, status, error, reload } = useApiQuery(load, {})
  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading order" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  const order = data?.order
  if (!order) return <div className="empty-state">Order not found.</div>
  return (
    <section>
      <p className="eyebrow">Order {order.orderNumber}</p>
      <h2>{order.status}</h2>
      <p className="order-total">
        {order.totalMinor} {order.currency}
      </p>
      <div className="stack-list">
        {(data.items || []).map((item) => (
          <article className="line-item" key={item._id}>
            <div>
              <h3>{item.productSnapshot?.title}</h3>
              <span>
                {item.variantSnapshot?.name} · quantity {item.quantity}
              </span>
            </div>
            <strong>{item.lineTotalMinor}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
