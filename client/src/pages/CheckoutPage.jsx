import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { LocationPicker } from '../components/LocationPicker.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { cartApi, couponApi, orderApi, paymentApi } from '../services/api.js'
import { formatMoney, variantLabel } from '../utils/format.js'

export function CheckoutPage() {
  // The delivery point is the whole address now: the shopper picks it on the
  // map and the recipient name comes from their account, server-side.
  const [address, setAddress] = useState(null)
  const [position, setPosition] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponError, setCouponError] = useState(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [geoStatus, setGeoStatus] = useState('idle') // idle | locating | done | error
  const [geoError, setGeoError] = useState(null)
  const checkoutIdempotencyKey = useRef(crypto.randomUUID())
  const navigate = useNavigate()

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setGeoError('Location is not available in this browser.')
      setGeoStatus('error')
      return
    }
    setGeoStatus('locating')
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const { latitude, longitude } = result.coords
        setPosition({ latitude, longitude })
        setGeoStatus('done')
      },
      (positionError) => {
        const messages = {
          1: 'Location permission was denied. Allow location for this site, then try again.',
          2: 'Your location could not be determined. Please try again.',
          3: 'That took too long. Please try again — it is usually quicker the second time.',
        }
        setGeoError(messages[positionError.code] || 'Could not get your location.')
        setGeoStatus('error')
      },
      // A network fix (not GPS) responds fast, and a recent cached position is
      // fine for a shipping location — both make timeouts far less likely.
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 300000 },
    )
  }
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
      // `label` is only for showing the resolved address on screen.
      const shippingAddress = { ...address }
      delete shippingAddress.label
      const order = await orderApi.create(
        {
          shippingAddress,
          billingAddress: shippingAddress,
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
        <div className="location-field">
          <h3 className="location-title">Where should this go?</h3>
          <button
            type="button"
            className="secondary-action"
            onClick={useCurrentLocation}
            disabled={geoStatus === 'locating'}
          >
            {geoStatus === 'locating'
              ? 'Getting your location…'
              : geoStatus === 'done'
                ? 'Re-centre on my location'
                : '📍 Send to my current location'}
          </button>
          {geoStatus === 'done' && position && (
            <LocationPicker
              latitude={position.latitude}
              longitude={position.longitude}
              onChange={setAddress}
            />
          )}
          {geoStatus === 'error' && geoError && (
            <p className="location-error" role="alert">
              {geoError}
            </p>
          )}
        </div>
        {error && <ErrorState message={error} />}
        <button className="primary-action" disabled={loading || !address}>
          {loading ? 'Processing payment' : 'Pay now'}
        </button>
        <button type="button" className="text-button" onClick={() => navigate('/cart')}>
          Back to cart
        </button>
      </form>
    </section>
  )
}
