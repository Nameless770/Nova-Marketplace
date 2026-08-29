import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { cartApi, orderApi, paymentApi } from '../services/api.js'
import { formatMoney, variantLabel } from '../utils/format.js'

const emptyAddress = {
  firstName: '',
  lastName: '',
  line1: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
}

export function CheckoutPage() {
  const [address, setAddress] = useState(emptyAddress)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const checkoutIdempotencyKey = useRef(crypto.randomUUID())
  const navigate = useNavigate()
  const loadCart = useCallback(() => cartApi.get(), [])
  const {
    data: cartData,
    status: cartStatus,
    error: cartError,
    reload,
  } = useApiQuery(loadCart, { cart: { items: [] } })
  const cart = cartData?.cart || cartData

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const idempotencyKey = checkoutIdempotencyKey.current
      const order = await orderApi.create(
        { shippingAddress: address, billingAddress: address },
        idempotencyKey,
      )
      const result = await paymentApi.createCheckout(order.data.data.order._id, idempotencyKey)
      window.location.href = result.data.data.url
    } catch (requestError) {
      setError(requestError.message)
      setLoading(false)
    }
  }
  if (cartStatus === 'loading' || cartStatus === 'idle') {
    return <LoadingState label="Loading checkout" />
  }
  if (cartStatus === 'error') return <ErrorState message={cartError} onRetry={reload} />
  if (!cart?.items?.length) {
    return (
      <section className="empty-state">
        <p className="eyebrow">Almost yours</p>
        <h2>Your cart is empty.</h2>
        <button className="primary-action" type="button" onClick={() => navigate('/products')}>
          Explore products
        </button>
      </section>
    )
  }

  return (
    <section className="auth-panel">
      <p className="eyebrow">Almost yours</p>
      <h2>Checkout</h2>
      <div className="checkout-summary">
        {(cart?.items || []).map((item) => (
          <div className="summary-line" key={item._id}>
            <span>
              {item.product?.title || 'Unavailable product'} · {variantLabel(item.variant)} · Qty{' '}
              {item.quantity}
            </span>
            <strong>{formatMoney(item.lineSubtotalMinor, cart.currency)}</strong>
          </div>
        ))}
        <div className="summary-line summary-total">
          <span>Total before shipping and tax</span>
          <strong>{formatMoney(cart?.subtotalMinor ?? 0, cart?.currency)}</strong>
        </div>
      </div>
      <form onSubmit={submit} className="address-form">
        {['firstName', 'lastName', 'line1', 'city', 'state', 'postalCode', 'country'].map(
          (field) => (
            <label key={field}>
              {field}
              <input
                required
                value={address[field]}
                onChange={(e) => setAddress({ ...address, [field]: e.target.value })}
              />
            </label>
          ),
        )}
        {error && <ErrorState message={error} />}
        <button className="primary-action" disabled={loading}>
          {loading ? 'Preparing payment' : 'Continue to secure payment'}
        </button>
        <button type="button" className="text-button" onClick={() => navigate('/cart')}>
          Back to cart
        </button>
      </form>
    </section>
  )
}
