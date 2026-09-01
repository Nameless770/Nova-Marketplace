import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductImage } from './ProductImage.jsx'
import { useAuth } from '../context/useAuth.js'
import { useCart } from '../context/useCart.js'
import { useWishlist } from '../context/useWishlist.js'
import { catalogApi } from '../services/api.js'
import { formatMoney, formatRating } from '../utils/format.js'

const sameId = (a, b) => String(a) === String(b)

export function ProductCard({ product }) {
  const { user } = useAuth()
  const { items: cartItems, addToCart, setQuantity } = useCart()
  const { items: wishItems, add: addWish, remove: removeWish } = useWishlist()
  // Cart and wishlist are customer-only on the API, so the quick actions only
  // show for a signed-in shopper.
  const isShopper = user?.role === 'customer'
  const price = product.currentPriceMinor ?? product.minPriceMinor ?? product.priceMinor

  // The product list doesn't carry variants, so the first action resolves (and
  // caches) a default variant id from the product detail.
  const [variantId, setVariantId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const cartLine = cartItems.find((item) => sameId(item.productId, product._id))
  const wishLine = wishItems.find((item) => sameId(item.productId, product._id))

  async function resolveVariantId() {
    if (variantId) return variantId
    const response = await catalogApi.getProduct(product._id)
    const variants = response.data.data.product?.variants ?? []
    const id = (variants.find((variant) => variant.status === 'active') ?? variants[0])?._id
    setVariantId(id)
    return id
  }

  // Every quick action cancels the click's navigation so it never leaves the page.
  const stop = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  async function guard(action) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch {
      // Swallow — the shared state simply stays as it was.
    } finally {
      setBusy(false)
    }
  }

  function toggleWishlist(event) {
    stop(event)
    guard(async () => {
      if (wishLine) {
        await removeWish(wishLine._id)
      } else {
        const id = await resolveVariantId()
        if (id) await addWish({ productId: product._id, variantId: id })
      }
    })
  }

  function addOne(event) {
    stop(event)
    guard(async () => {
      const id = await resolveVariantId()
      if (id) await addToCart({ productId: product._id, variantId: id, quantity: 1 })
    })
  }

  function step(delta, event) {
    stop(event)
    if (!cartLine) return
    if (cartLine.quantity + delta < 1) setExpanded(false)
    guard(() => setQuantity(cartLine._id, cartLine.quantity + delta))
  }

  const saved = Boolean(wishLine)

  return (
    <article className="product-card">
      <div className="product-media">
        <Link to={`/products/${product._id}`} className="product-image">
          <ProductImage
            url={product.images?.[0]?.url}
            alt={product.images?.[0]?.alt}
            label={product.title}
          />
        </Link>
        {isShopper && (
          <button
            type="button"
            className={`wishlist-heart${saved ? ' is-active' : ''}`}
            onClick={toggleWishlist}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            title={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill={saved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </button>
        )}
      </div>
      <div className="product-card-body">
        <span className="product-brand">{product.brand || 'Independent label'}</span>
        <Link to={`/products/${product._id}`}>
          <h3>{product.title}</h3>
        </Link>
        <div className="product-meta">
          <strong>{formatMoney(price, product.currency)}</strong>
          <span>{formatRating(product.ratingAverage)} / 5</span>
        </div>
        {isShopper &&
          (!cartLine ? (
            <button type="button" className="add-to-cart" onClick={addOne} disabled={busy}>
              Add to cart
            </button>
          ) : expanded ? (
            <div className="qty-stepper" aria-label="Quantity in cart">
              <button
                type="button"
                onClick={(event) => step(-1, event)}
                disabled={busy}
                // At one, minus removes the item — say so, so the disappearance
                // is not a surprise. Matches the cart page's stepper.
                aria-label={cartLine.quantity === 1 ? 'Remove from cart' : 'Decrease quantity'}
                title={cartLine.quantity === 1 ? 'Remove from cart' : 'Decrease quantity'}
              >
                −
              </button>
              <span className="qty-value">{cartLine.quantity}</span>
              <button
                type="button"
                onClick={(event) => step(1, event)}
                disabled={busy}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="add-to-cart in-cart"
              onClick={(event) => {
                stop(event)
                setExpanded(true)
              }}
              aria-label={`${cartLine.quantity} in cart — adjust quantity`}
            >
              {cartLine.quantity} in cart
            </button>
          ))}
      </div>
    </article>
  )
}
