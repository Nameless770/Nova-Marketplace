import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { cartApi, couponApi, orderApi, paymentApi } from '../services/api.js'
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

const addressFields = [
  { name: 'firstName', label: 'First name' },
  { name: 'lastName', label: 'Last name' },
  { name: 'line1', label: 'Address' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State' },
  { name: 'postalCode', label: 'Postal code' },
  { name: 'country', label: 'Country (2-letter code)', maxLength: 2, placeholder: 'US' },
]

export function CheckoutPage() {
  const [address, setAddress] = useState(emptyAddress)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponError, setCouponError] = useState(null)
  const [couponLoading, setCouponLoading] = useState(false)
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

  async function applyCoupon() {
    const code = couponCode.trim()
    if (code.length < 2) {
      setCouponError('Enter a valid coupon code')
      return
    }
    setCouponLoading(true)
    setCouponError(null)
    try {
      const response = await couponApi.validate(code)
      setAppliedCoupon(response.data.data)
    } catch (requestError) {
      setAppliedCoupon(null)
      setCouponError(requestError.message)
    } finally {
      setCouponLoading(false)
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponError(null)
  }

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const idempotencyKey = checkoutIdempotencyKey.current
      const order = await orderApi.create(
        {
          shippingAddress: address,
          billingAddress: address,
          ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
        },
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
        {appliedCoupon && (
          <div className="summary-line">
            <span>Coupon {appliedCoupon.code}</span>
            <strong>-{formatMoney(appliedCoupon.discountMinor, cart?.currency)}</strong>
          </div>
        )}
        <div className="summary-line summary-total">
          <span>Total before shipping and tax</span>
          <strong>
            {formatMoney(
              Math.max(0, (cart?.subtotalMinor ?? 0) - (appliedCoupon?.discountMinor ?? 0)),
              cart?.currency,
            )}
          </strong>
        </div>
      </div>
      <div className="coupon-row">
        <label>
          Coupon code
          <input
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value)}
            disabled={Boolean(appliedCoupon)}
          />
        </label>
        <button
          type="button"
          className="secondary-action"
          onClick={appliedCoupon ? removeCoupon : applyCoupon}
          disabled={couponLoading}
        >
          {couponLoading ? 'Checking' : appliedCoupon ? 'Remove' : 'Apply'}
        </button>
      </div>
      {couponError && <ErrorState message={couponError} />}
      {appliedCoupon && (
        <p className="coupon-applied">
          Coupon applied. The final discount is recalculated securely when your order is placed.
        </p>
      )}
      <form onSubmit={submit} className="address-form">
        {addressFields.map((field) => (
          <label key={field.name}>
            {field.label}
            <input
              required
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              value={address[field.name]}
              onChange={(e) => setAddress({ ...address, [field.name]: e.target.value })}
            />
          </label>
        ))}
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
