import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { ProductCard } from '../components/ProductCard.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { catalogApi } from '../services/api.js'

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [draft, setDraft] = useState({
    q: searchParams.get('q') || '',
    sort: searchParams.get('sort') || 'newest',
  })
  const searchKey = searchParams.toString()
  const params = Object.fromEntries(searchParams.entries())
  const activeCategoryId = params.categoryId

  const load = useCallback(
    () =>
      catalogApi.searchProducts({
        ...Object.fromEntries(new URLSearchParams(searchKey)),
        limit: 24,
      }),
    [searchKey],
  )
  const { data, status, error, reload } = useApiQuery(load, { items: [], meta: {} })

  // Only fetch the category list when one is actually filtering, so the plain
  // product page does not pay for a lookup it will not use.
  const loadCategories = useCallback(
    () =>
      activeCategoryId
        ? catalogApi.getCategories()
        : Promise.resolve({ data: { data: { categories: [] } } }),
    [activeCategoryId],
  )
  const { data: categoryData } = useApiQuery(loadCategories, { categories: [] })
  const activeCategory = (categoryData?.categories || []).find(
    (category) => category._id === activeCategoryId,
  )

  function search(event) {
    event.preventDefault()
    const next = { sort: draft.sort }
    if (draft.q) next.q = draft.q
    // Carry the category through a search: rebuilding params from scratch would
    // silently drop the filter the shopper is already browsing inside.
    if (activeCategoryId) next.categoryId = activeCategoryId
    setSearchParams(next)
  }

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading products" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  const products = data?.items || []

  const heading = params.q
    ? `Results for “${params.q}”`
    : (activeCategory?.name ?? (activeCategoryId ? 'Category' : 'Explore products'))

  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">The collection</p>
          <h2>{heading}</h2>
        </div>
        <span className="result-count">{products.length} results</span>
      </div>

      {activeCategoryId && (
        <div className="active-filters">
          <span className="filter-chip">
            {activeCategory?.name ?? 'Category'}
            <Link
              to={params.q ? `/products?q=${encodeURIComponent(params.q)}` : '/products'}
              aria-label="Clear category filter"
            >
              ×
            </Link>
          </span>
        </div>
      )}

      <form className="search-tools" onSubmit={search}>
        <input
          aria-label="Search products"
          placeholder="Search the collection"
          value={draft.q}
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
        />
        <select
          aria-label="Sort products"
          value={draft.sort}
          onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating">Top rated</option>
        </select>
        <button className="primary-action" type="submit">
          Search
        </button>
      </form>

      {products.length ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      ) : (
        <div className="empty-state">No products match this search yet.</div>
      )}

      {data?.meta?.hasMore && (
        <button
          className="load-more"
          type="button"
          onClick={() => setSearchParams({ ...params, cursor: data.meta.nextCursor })}
        >
          Load more
        </button>
      )}
    </section>
  )
}
