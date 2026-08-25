import { useCallback } from 'react'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { catalogApi } from '../services/api.js'

export function CategoriesPage() {
  const loadCategories = useCallback(() => catalogApi.getCategories(), [])
  const { data, status, error, reload } = useApiQuery(loadCategories, { categories: [] })

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading categories" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  return (
    <section>
      <p className="eyebrow">Browse by intent</p>
      <h2>Categories</h2>
      <div className="category-list">
        {(data?.categories || []).map((category) => (
          <div key={category._id}>{category.name}</div>
        ))}
      </div>
    </section>
  )
}
