import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState.jsx'
import { AdminTable, Pagination, TableToolbar } from '../../components/admin/AdminTable.jsx'
import { useAdminTable } from '../../hooks/useAdminTable.js'
import { useRowAction } from '../../hooks/useRowAction.js'
import { adminApi } from '../../services/api.js'
import { formatMoney, formatRating } from '../../utils/format.js'

export function AdminProductsPage() {
  const fetcher = useCallback((params) => adminApi.getProducts(params), [])
  const table = useAdminTable(fetcher, { sortBy: 'createdAt' })
  const { pendingId, actionError, run } = useRowAction(table.reload)

  const columns = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (product) => <Link to={`/products/${product._id}`}>{product.title}</Link>,
    },
    {
      key: 'currentPriceMinor',
      header: 'Price',
      sortable: true,
      render: (product) => formatMoney(product.currentPriceMinor ?? 0, 'USD'),
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (product) => `${formatRating(product.ratingAverage)} / 5`,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (product) => <span className={`pill pill-${product.status}`}>{product.status}</span>,
    },
    {
      key: 'actions',
      header: 'Manage',
      render: (product) => (
        <div className="cell-actions">
          {product.status !== 'active' && (
            <button
              type="button"
              className="text-button"
              disabled={pendingId === product._id}
              onClick={() => run(product._id, () => adminApi.setProductStatus(product._id, 'active'))}
            >
              Approve
            </button>
          )}
          {product.status !== 'removed' && (
            <button
              type="button"
              className="text-button"
              disabled={pendingId === product._id}
              onClick={() =>
                run(product._id, () => adminApi.setProductStatus(product._id, 'removed'))
              }
            >
              Remove
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <section>
      <p className="eyebrow">Products</p>
      <h2>Manage products</h2>
      <TableToolbar
        table={table}
        searchPlaceholder="Search by title"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['active', 'pending_review', 'rejected', 'removed'],
          },
        ]}
      />
      {actionError && <ErrorState message={actionError} />}
      <AdminTable table={table} columns={columns} emptyLabel="No products match these filters." />
      <Pagination table={table} />
    </section>
  )
}
