import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { ORDER_STATUS_LABELS } from '../utils/orderStatus.js'
import { orderApi } from '../services/api.js'
import { formatMoney } from '../utils/format.js'

export function OrdersPage() {
  const load = useCallback(() => orderApi.list({ limit: 20 }), [])
  const { data, status, error, reload } = useApiQuery(load, { items: [] })
  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading orders" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  const orders = data?.items || []
  return (
    <section>
      <p className="eyebrow">Your history</p>
      <h2>Orders</h2>
      {orders.length ? (
        <div className="stack-list">
          {orders.map((order) => (
            <Link className="line-item order-link" key={order._id} to={`/orders/${order._id}`}>
              <div>
                <h3>{order.orderNumber}</h3>
                <span>{new Date(order.createdAt).toLocaleDateString()}</span>
              </div>
              <strong>{formatMoney(order.totalMinor, order.currency)}</strong>
              <span className={`status-pill status-${order.status}`}>
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">Your completed orders will appear here.</div>
      )}
    </section>
  )
}
