import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { sellerApi } from '../../services/api.js'
import { formatMoney, formatRating } from '../../utils/format.js'

export function SellerProductsPage() {
  const load = useCallback(() => sellerApi.getProducts(), [])
  const { data, status, error, reload } = useApiQuery(load, null)

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading products" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const products = data?.items ?? []

  return (
    <section>
      <p className="eyebrow">Products</p>
      <h2>Your catalogue</h2>
      <div className="seller-toolbar">
        <Link className="primary-action" to="/seller/products/new">
          New product
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="seller-subtle">You have not created any products yet.</p>
      ) : (
        <table className="seller-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Price</th>
              <th>Rating</th>
              <th>Status</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product._id}>
                <td>
                  <Link to={`/products/${product._id}`}>{product.title}</Link>
                </td>
                <td>
                  {formatMoney(product.currentPriceMinor ?? product.minPriceMinor ?? 0, 'USD')}
                </td>
                <td>
                  {formatRating(product.ratingAverage)} / 5 ({product.ratingCount ?? 0})
                </td>
                <td>
                  <span className={`pill pill-${product.status}`}>{product.status}</span>
                </td>
                <td>
                  <Link className="text-button" to={`/seller/products/${product._id}`}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
