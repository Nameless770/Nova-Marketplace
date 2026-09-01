import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { ProductImage } from '../components/ProductImage.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { wishlistApi } from '../services/api.js'
import { formatMoney, variantLabel } from '../utils/format.js'

export function WishlistPage() {
  const load = useCallback(() => wishlistApi.get(), [])
  const { data, status, error, reload } = useApiQuery(load, { wishlist: { items: [] } })
  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading wishlist" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  const wishlist = data?.wishlist || data
  if (!wishlist?.items?.length)
    return (
      <div className="empty-state">
        <p className="eyebrow">Saved for later</p>
        <h2>Your wishlist is quiet.</h2>
        <Link className="primary-action" to="/products">
          Find something
        </Link>
      </div>
    )
  return (
    <section>
      <p className="eyebrow">Saved for later</p>
      <h2>Wishlist</h2>
      <div className="stack-list">
        {wishlist.items.map((item) => (
          <article className="line-item" key={item._id}>
            <Link className="line-item-image" to={`/products/${item.productId}`}>
              <ProductImage
                url={item.product?.image?.url}
                alt={item.product?.image?.alt}
                label={item.product?.title}
              />
            </Link>
            <div>
              <h3>{item.product?.title || 'Unavailable product'}</h3>
              <span>
                {variantLabel(item.variant)} · {item.seller?.storeName || 'Seller unavailable'} ·{' '}
                {item.availability}
              </span>
              <strong>{formatMoney(item.currentPriceMinor, 'USD')}</strong>
            </div>
            <button
              className="text-button"
              onClick={async () => {
                await wishlistApi.remove(item._id)
                reload()
              }}
            >
              Remove
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
