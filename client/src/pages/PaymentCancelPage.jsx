import { Link } from 'react-router-dom'

export function PaymentCancelPage() {
  return (
    <section className="state-panel">
      <p className="eyebrow">Payment cancelled</p>
      <h2>Checkout was not completed.</h2>
      <p>Your payment was cancelled. Your order is not confirmed until payment succeeds.</p>
      <div className="action-row">
        <Link className="primary-action" to="/cart">
          Return to cart
        </Link>
        <Link className="secondary-action" to="/products">
          Keep shopping
        </Link>
      </div>
    </section>
  )
}
