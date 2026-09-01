import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { ProductImage } from '../components/ProductImage.jsx'
import { ProductReviews } from '../components/ProductReviews.jsx'
import { RecommendationShelf } from '../components/RecommendationShelf.jsx'
import { useAuth } from '../context/useAuth.js'
import { useCart } from '../context/useCart.js'
import { useWishlist } from '../context/useWishlist.js'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { catalogApi, recommendationApi } from '../services/api.js'
import { formatMoney, variantLabel } from '../utils/format.js'

const sameId = (a, b) => String(a) === String(b)

export function ProductDetailsPage() {
  const { productId } = useParams()
  const [selectedVariant, setSelectedVariant] = useState('')
  const [actionError, setActionError] = useState(null)
  const [actionPending, setActionPending] = useState(false)
  const [stepperOpen, setStepperOpen] = useState(false)
  const { user } = useAuth()
  const { items: cartItems, addToCart, setQuantity } = useCart()
  const { items: wishItems, add: addWish, remove: removeWish } = useWishlist()
  // Buying is customer-only on the API. Rather than offer a button the server
  // will refuse, the page says who can do what.
  const isShopper = user?.role === 'customer'
  const load = useCallback(() => catalogApi.getProduct(productId), [productId])
  const { data, status, error, reload } = useApiQuery(load, {})
  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading product" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  const product = data?.product
  if (!product) return <div className="empty-state">Product not found.</div>
  const variants = product.variants || []
  const variant = variants.find((item) => item._id === selectedVariant) || variants[0]
  // Both quick actions stay on the page — they update the shared cart/wishlist
  // rather than navigating away. Lines are matched on the selected variant, so
  // switching variants shows that variant's own quantity.
  const cartLine = cartItems.find(
    (item) => sameId(item.productId, product._id) && sameId(item.variantId, variant?._id),
  )
  const wishLine = wishItems.find(
    (item) => sameId(item.productId, product._id) && sameId(item.variantId, variant?._id),
  )

  async function runAction(action) {
    if (!variant || actionPending) return
    setActionPending(true)
    setActionError(null)
    try {
      await action()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setActionPending(false)
    }
  }
  function addCart() {
    runAction(() => addToCart({ productId: product._id, variantId: variant._id, quantity: 1 }))
  }
  function stepCart(delta) {
    if (!cartLine) return
    if (cartLine.quantity + delta < 1) setStepperOpen(false)
    runAction(() => setQuantity(cartLine._id, cartLine.quantity + delta))
  }
  function toggleWishlist() {
    runAction(() =>
      wishLine
        ? removeWish(wishLine._id)
        : addWish({ productId: product._id, variantId: variant._id }),
    )
  }
  return (
    <section className="detail-layout">
      <div className="detail-image">
        <ProductImage
          url={product.images?.[0]?.url}
          alt={product.images?.[0]?.alt}
          label={product.title}
        />
      </div>
      <div className="detail-copy">
        <p className="eyebrow">{product.brand || 'Independent label'}</p>
        <h2>{product.title}</h2>
        <p>{product.description}</p>
        <strong className="detail-price">
          {formatMoney(variant?.currentPriceMinor ?? product.currentPriceMinor, product.currency)}
        </strong>
        {variants.length > 0 && (
          <label className="variant-select">
            Choose a variant
            <select
              value={selectedVariant || variants[0]?._id}
              onChange={(e) => setSelectedVariant(e.target.value)}
            >
              {variants.map((item) => (
                <option key={item._id} value={item._id}>
                  {variantLabel(item)}
                </option>
              ))}
            </select>
          </label>
        )}
        {isShopper && (
          <div className="action-row">
            {!cartLine ? (
              <button className="primary-action" onClick={addCart} disabled={actionPending}>
                Add to cart
              </button>
            ) : stepperOpen ? (
              <div className="qty-stepper" aria-label="Quantity in cart">
                <button
                  type="button"
                  onClick={() => stepCart(-1)}
                  disabled={actionPending}
                  aria-label={cartLine.quantity === 1 ? 'Remove from cart' : 'Decrease quantity'}
                >
                  −
                </button>
                <span className="qty-value">{cartLine.quantity}</span>
                <button
                  type="button"
                  onClick={() => stepCart(1)}
                  disabled={actionPending}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            ) : (
              <button
                className="primary-action"
                onClick={() => setStepperOpen(true)}
                aria-label={`${cartLine.quantity} in cart — adjust quantity`}
              >
                {cartLine.quantity} in cart
              </button>
            )}
            <button
              className="secondary-action"
              onClick={toggleWishlist}
              disabled={actionPending}
              aria-pressed={Boolean(wishLine)}
            >
              {wishLine ? '♥ Saved — remove' : 'Save to wishlist'}
            </button>
          </div>
        )}
        {!user && (
          <div className="action-row">
            <Link
              className="primary-action"
              to="/login"
              state={{ from: `/products/${product._id}` }}
            >
              Sign in to buy
            </Link>
          </div>
        )}
        {user && !isShopper && (
          <p className="role-note">
            You are signed in as {user.role === 'admin' ? 'an administrator' : 'a seller'}. Shopping
            is available on customer accounts.
          </p>
        )}
        {actionError && <ErrorState message={actionError} />}
        <ProductReviews productId={product._id} />
      </div>
      <SimilarProducts productId={product._id} />
    </section>
  )
}

function SimilarProducts({ productId }) {
  const fetcher = useCallback(() => recommendationApi.similar(productId, { limit: 6 }), [productId])
  return <RecommendationShelf title="Similar products" fetcher={fetcher} />
}
