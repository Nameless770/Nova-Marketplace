import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { ProductReviews } from '../components/ProductReviews.jsx'
import { RecommendationShelf } from '../components/RecommendationShelf.jsx'
import { useAuth } from '../context/useAuth.js'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { catalogApi, cartApi, recommendationApi, wishlistApi } from '../services/api.js'
import { formatMoney, variantLabel } from '../utils/format.js'

export function ProductDetailsPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const [selectedVariant, setSelectedVariant] = useState('')
  const [actionError, setActionError] = useState(null)
  const [actionPending, setActionPending] = useState(false)
  const { user } = useAuth()
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
  async function runAction(action, destination) {
    if (!variant) return
    setActionPending(true)
    setActionError(null)
    try {
      await action()
      navigate(destination)
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setActionPending(false)
    }
  }
  async function addCart() {
    await runAction(
      () => cartApi.add({ productId: product._id, variantId: variant._id, quantity: 1 }),
      '/cart',
    )
  }
  async function addWishlist() {
    await runAction(
      () => wishlistApi.add({ productId: product._id, variantId: variant._id }),
      '/wishlist',
    )
  }
  return (
    <section className="detail-layout">
      <div className="detail-image">
        {product.images?.[0]?.url ? (
          <img src={product.images[0].url} alt={product.images[0].alt || product.title} />
        ) : (
          'No image'
        )}
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
            <button className="primary-action" onClick={addCart} disabled={actionPending}>
              {actionPending ? 'Working' : 'Add to cart'}
            </button>
            <button className="secondary-action" onClick={addWishlist} disabled={actionPending}>
              Save to wishlist
            </button>
          </div>
        )}
        {!user && (
          <div className="action-row">
            <Link className="primary-action" to="/login" state={{ from: `/products/${product._id}` }}>
              Sign in to buy
            </Link>
          </div>
        )}
        {user && !isShopper && (
          <p className="role-note">
            You are signed in as {user.role === 'admin' ? 'an administrator' : 'a seller'}.
            Shopping is available on customer accounts.
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
  const fetcher = useCallback(
    () => recommendationApi.similar(productId, { limit: 6 }),
    [productId],
  )
  return <RecommendationShelf title="Similar products" fetcher={fetcher} />
}
