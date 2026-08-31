import { Link } from 'react-router-dom'
import { formatMoney, formatRating } from '../utils/format.js'

export function ProductCard({ product, onAdd }) {
  const image = product.images?.[0]?.url
  const price = product.currentPriceMinor ?? product.minPriceMinor ?? product.priceMinor
  return (
    <article className="product-card">
      <Link to={`/products/${product._id}`} className="product-image">
        {image ? (
          <img src={image} alt={product.images[0].alt || product.title} />
        ) : (
          <span>No image</span>
        )}
      </Link>
      <div className="product-card-body">
        <span className="product-brand">{product.brand || 'Independent label'}</span>
        <Link to={`/products/${product._id}`}>
          <h3>{product.title}</h3>
        </Link>
        <div className="product-meta">
          <strong>{formatMoney(price, product.currency)}</strong>
          <span>{formatRating(product.ratingAverage)} / 5</span>
        </div>
        {onAdd && (
          <button type="button" onClick={() => onAdd(product)}>
            Add to cart
          </button>
        )}
      </div>
    </article>
  )
}
