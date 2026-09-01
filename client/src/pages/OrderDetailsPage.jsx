import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { OrderTracker } from '../components/OrderTracker.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { ORDER_STATUS_LABELS } from '../utils/orderStatus.js'
import { orderApi } from '../services/api.js'
import { formatMoney, variantLabel } from '../utils/format.js'

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
      <h2>{ORDER_STATUS_LABELS[order.status] ?? order.status}</h2>
      <p className="order-total">{formatMoney(order.totalMinor, order.currency)}</p>
      <OrderTracker status={order.status} statusHistory={order.statusHistory} />
      <div className="stack-list">
        {(data.items || []).map((item) => (
          <article className="line-item" key={item._id}>
            <div>
              <h3>{item.productSnapshot?.title}</h3>
              <span>
                {variantLabel(item.variantSnapshot)} · Quantity {item.quantity}
              </span>
            </div>
            <strong>{formatMoney(item.lineTotalMinor, order.currency)}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
