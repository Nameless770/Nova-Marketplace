import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { ProductImage } from '../components/ProductImage.jsx'
import { useCart } from '../context/useCart.js'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { cartApi } from '../services/api.js'
import { formatMoney, variantLabel } from '../utils/format.js'

export function CartPage() {
  // Mutations go through the shared cart context so the navbar badge stays in
  // step with edits made here, not just those made from a product card.
  const { setQuantity, removeItem, refresh } = useCart()
  const load = useCallback(() => cartApi.get(), [])
  const { data, status, error, reload } = useApiQuery(load, { cart: { items: [] } })
  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading cart" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  const cart = data?.cart || data
  if (!cart?.items?.length)
    return (
      <div className="empty-state">
        <p className="eyebrow">Your basket</p>
        <h2>Nothing here yet.</h2>
        <Link className="primary-action" to="/products">
          Explore products
        </Link>
      </div>
    )
  // Stepping below one removes the line entirely, so pressing − at a quantity of
  // 1 takes the product out of the basket rather than sticking at 1.
  async function update(item, quantity) {
    await setQuantity(item._id, quantity)
    reload()
  }
  async function remove(item) {
    await removeItem(item._id)
    reload()
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your basket</p>
          <h2>Cart</h2>
        </div>
        <button
          className="secondary-action"
          onClick={async () => {
            await cartApi.clear()
            await refresh()
            reload()
          }}
        >
          Clear cart
        </button>
      </div>
      <div className="stack-list">
        {cart.items.map((item) => (
          <article className="line-item" key={item._id}>
            <Link className="line-item-image" to={`/products/${item.productId}`}>
              <ProductImage
                url={item.product?.image?.url}
                alt={item.product?.image?.alt}
                label={item.product?.title}
                seed={item.productId}
              />
            </Link>
            <div>
              <h3>{item.product?.title || 'Unavailable product'}</h3>
              <span>
                {variantLabel(item.variant)} · {item.seller?.storeName || 'Seller unavailable'} ·{' '}
                {item.availability}
              </span>
              <strong>
                {formatMoney(item.currentPriceMinor ?? item.unitPriceMinor, cart.currency)}
              </strong>
            </div>
            <div className="quantity">
              <button
                onClick={() => update(item, item.quantity - 1)}
                aria-label={item.quantity === 1 ? 'Remove from cart' : 'Decrease quantity'}
                title={item.quantity === 1 ? 'Remove from cart' : 'Decrease quantity'}
              >
                −
              </button>
              <strong>{item.quantity}</strong>
              <button
                onClick={() => update(item, item.quantity + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <strong>{formatMoney(item.lineSubtotalMinor, cart.currency)}</strong>
            <button className="text-button" onClick={() => remove(item)}>
              Remove
            </button>
          </article>
        ))}
      </div>
      <div className="cart-summary">
        <span>Subtotal</span>
        <strong>{formatMoney(cart.subtotalMinor, cart.currency)}</strong>
      </div>
      <Link className="primary-action checkout-link" to="/checkout">
        Continue to checkout
      </Link>
    </section>
  )
}
