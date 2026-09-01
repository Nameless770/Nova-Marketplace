import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { catalogApi } from '../services/api.js'

export function CategoriesPage() {
  const loadCategories = useCallback(() => catalogApi.getCategories(), [])
  const { data, status, error, reload } = useApiQuery(loadCategories, { categories: [] })

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading categories" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const categories = data?.categories || []

  return (
    <section>
      <p className="eyebrow">Browse by intent</p>
      <h2>Categories</h2>

      {categories.length === 0 ? (
        <p className="empty-state">No categories yet.</p>
      ) : (
        <div className="category-list">
          {categories.map((category) => (
            // The products page forwards every query param to the search API,
            // so categoryId filters the results with no extra plumbing.
            <Link
              key={category._id}
              className="category-tile"
              to={`/products?categoryId=${category._id}`}
            >
              <span className="category-tile-name">{category.name}</span>
              {category.description && (
                <span className="category-tile-desc">{category.description}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
