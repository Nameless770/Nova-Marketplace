import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { paymentApi } from '../services/api.js'
import { formatMoney } from '../utils/format.js'
import { ORDER_STATUS_LABELS } from '../utils/orderStatus.js'

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const load = useCallback(() => {
    if (!sessionId) return Promise.reject(new Error('Checkout session is missing.'))
    return paymentApi.getCheckoutSession(sessionId)
  }, [sessionId])
  const { data, status, error, reload } = useApiQuery(load, {})

  if (!sessionId) {
    return <ErrorState message="Checkout session is missing from the payment redirect." />
  }
  if (status === 'loading' || status === 'idle') return <LoadingState label="Checking payment" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const { order, payment } = data
  const paid = payment?.status === 'paid'

  return (
    <section className="state-panel">
      <p className="eyebrow">Order placed</p>
      <h2>{paid ? 'Order confirmed' : 'Order received'}</h2>
      <p>
        {paid
          ? 'Your order is confirmed. Pay the courier in cash when it arrives.'
          : 'Your order has been received and is being confirmed.'}
      </p>
      {order && (
        <div className="summary-lines">
          <span>{order.orderNumber}</span>
          <strong>{formatMoney(order.totalMinor, order.currency)}</strong>
          <span>Order status: {ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
          <span>Payment: cash on delivery</span>
        </div>
      )}
      {order && (
        <Link className="primary-action" to={`/orders/${order._id}`}>
          View order
        </Link>
      )}
    </section>
  )
}
