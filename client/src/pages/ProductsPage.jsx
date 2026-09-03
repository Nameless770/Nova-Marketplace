import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { ProductCard } from '../components/ProductCard.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { catalogApi } from '../services/api.js'
import { formatMoney, fromMinorUnits, toMinorUnits } from '../utils/format.js'

/** Reads as a range when both ends are set, and open-ended when only one is. */
function priceLabel(minPrice, maxPrice) {
  if (minPrice && maxPrice)
    return `${formatMoney(Number(minPrice))} – ${formatMoney(Number(maxPrice))}`
  if (minPrice) return `${formatMoney(Number(minPrice))} and up`
  return `Under ${formatMoney(Number(maxPrice))}`
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Prices live in the URL as minor units, because that is what the API filters
  // on; the inputs show them as ordinary amounts.
  const [draft, setDraft] = useState({
    q: searchParams.get('q') || '',
    sort: searchParams.get('sort') || 'newest',
    minPrice: fromMinorUnits(searchParams.get('minPrice')),
    maxPrice: fromMinorUnits(searchParams.get('maxPrice')),
  })
  const searchKey = searchParams.toString()
  const params = Object.fromEntries(searchParams.entries())
  // Read straight off the params rather than through the object above: that one
  // is rebuilt every render, which costs the effects below their memoization.
  const activeCategoryId = searchParams.get('categoryId') ?? undefined

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

  const minPrice = toMinorUnits(draft.minPrice)
  const maxPrice = toMinorUnits(draft.maxPrice)
  // Caught before the request: an inverted range is not an error the API can
  // report usefully, it just returns nothing and looks like an empty catalogue.
  const rangeInverted = minPrice !== null && maxPrice !== null && minPrice > maxPrice

  function search(event) {
    event.preventDefault()
    if (rangeInverted) return
    const next = { sort: draft.sort }
    if (draft.q) next.q = draft.q
    // Carry the category through a search: rebuilding params from scratch would
    // silently drop the filter the shopper is already browsing inside.
    if (activeCategoryId) next.categoryId = activeCategoryId
    if (minPrice !== null) next.minPrice = String(minPrice)
    if (maxPrice !== null) next.maxPrice = String(maxPrice)
    setSearchParams(next)
  }

  /** Drops one filter while leaving the rest of the search intact. */
  function clearParams(keys) {
    const next = Object.fromEntries(searchParams.entries())
    for (const key of keys) delete next[key]
    // A cursor belongs to the previous result set; keeping it would page into
    // the wrong list.
    delete next.cursor
    setDraft((current) => ({
      ...current,
      ...(keys.includes('minPrice') && { minPrice: '' }),
      ...(keys.includes('maxPrice') && { maxPrice: '' }),
    }))
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

      {(activeCategoryId || params.minPrice || params.maxPrice) && (
        <div className="active-filters">
          {activeCategoryId && (
            <span className="filter-chip">
              {activeCategory?.name ?? 'Category'}
              <button
                type="button"
                onClick={() => clearParams(['categoryId'])}
                aria-label="Clear category filter"
              >
                ×
              </button>
            </span>
          )}
          {(params.minPrice || params.maxPrice) && (
            <span className="filter-chip">
              {priceLabel(params.minPrice, params.maxPrice)}
              <button
                type="button"
                onClick={() => clearParams(['minPrice', 'maxPrice'])}
                aria-label="Clear price filter"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}

      <form className="search-tools" onSubmit={search}>
        <input
          aria-label="Search products"
          placeholder="Search the collection"
          value={draft.q}
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
        />
        <div className="price-range" role="group" aria-label="Price range">
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            aria-label="Minimum price"
            placeholder="Min $"
            value={draft.minPrice}
            onChange={(e) => setDraft({ ...draft, minPrice: e.target.value })}
          />
          <span aria-hidden="true">–</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            aria-label="Maximum price"
            placeholder="Max $"
            value={draft.maxPrice}
            onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value })}
          />
        </div>
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
        <button className="primary-action" type="submit" disabled={rangeInverted}>
          Search
        </button>
      </form>
      {rangeInverted && (
        <p className="filter-warning">The lowest price needs to be below the highest.</p>
      )}

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
