import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { paymentApi } from '../services/api.js'
import { formatMoney } from '../utils/format.js'

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
      <p className="eyebrow">Payment returned</p>
      <h2>{paid ? 'Payment confirmed' : 'Payment is being verified'}</h2>
      <p>
        {paid
          ? 'Your order is confirmed.'
          : 'Stripe sent you back successfully. Final confirmation still depends on the verified webhook.'}
      </p>
      {order && (
        <div className="summary-lines">
          <span>{order.orderNumber}</span>
          <strong>{formatMoney(order.totalMinor, order.currency)}</strong>
          <span>Order status: {order.status}</span>
          <span>Payment status: {payment?.status}</span>
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
