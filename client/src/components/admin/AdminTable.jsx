import { ErrorState } from '../ErrorState.jsx'
import { LoadingState } from '../LoadingState.jsx'

function SortIndicator({ active, direction }) {
  if (!active) return <span className="sort-indicator"> ↕</span>
  return <span className="sort-indicator active"> {direction === 'asc' ? '↑' : '↓'}</span>
}

/**
 * Generic admin table. `columns` is [{ key, header, render, sortable }].
 * Renders its own loading / error / empty states so each page does not repeat them.
 */
export function AdminTable({ table, columns, emptyLabel = 'Nothing to show.', rowKey }) {
  const { items, status, error, reload, sort, toggleSort } = table

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  if (items.length === 0) return <p className="admin-subtle">{emptyLabel}</p>

  return (
    <div className="table-scroll">
      <table className="seller-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                {column.sortable ? (
                  <button
                    type="button"
                    className="sort-button"
                    onClick={() => toggleSort(column.key)}
                  >
                    {column.header}
                    <SortIndicator
                      active={sort.sortBy === column.key}
                      direction={sort.sortDir}
                    />
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={rowKey ? rowKey(item) : item._id}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TableToolbar({
  table,
  searchPlaceholder = 'Search',
  searchable = true,
  filters = [],
}) {
  return (
    <div className="table-toolbar">
      {searchable && (
        <input
          type="search"
          className="table-search"
          placeholder={searchPlaceholder}
          value={table.searchInput}
          onChange={(event) => table.setSearchInput(event.target.value)}
        />
      )}
      {filters.map((filter) => (
        <label key={filter.key} className="table-filter">
          <span className="visually-hidden">{filter.label}</span>
          <select
            value={table.filters[filter.key] ?? ''}
            onChange={(event) => table.setFilter(filter.key, event.target.value)}
          >
            <option value="">{filter.label}: all</option>
            {filter.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}

export function Pagination({ table }) {
  const { meta, page, setPage, status } = table
  const totalPages = meta.totalPages ?? 1
  if (status !== 'success' || totalPages <= 1) return null

  return (
    <div className="pagination">
      <button
        type="button"
        className="text-button"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span className="admin-subtle">
        Page {meta.page} of {totalPages} · {meta.total} total
      </span>
      <button
        type="button"
        className="text-button"
        disabled={page >= totalPages}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </div>
  )
}
