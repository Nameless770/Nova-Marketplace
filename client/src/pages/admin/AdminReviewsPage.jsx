import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { AdminTable, Pagination, TableToolbar } from '../../components/admin/AdminTable.jsx'
import { ReasonDialog } from '../../components/admin/ReasonDialog.jsx'
import { useAdminTable } from '../../hooks/useAdminTable.js'
import { useRowAction } from '../../hooks/useRowAction.js'
import { adminApi } from '../../services/api.js'

export function AdminReviewsPage() {
  const fetcher = useCallback((params) => adminApi.getReviews(params), [])
  const table = useAdminTable(fetcher, { sortBy: 'createdAt', filters: { status: 'pending' } })
  const { pendingId, actionError, run } = useRowAction(table.reload)
  const [dialog, setDialog] = useState(null)

  function moderate(review, status) {
    // The API requires a reason for rejection and removal.
    if (['rejected', 'removed'].includes(status)) {
      setDialog({ review, status })
      return
    }
    run(review._id, () => adminApi.setReviewStatus(review._id, status))
  }

  const columns = [
    { key: 'productTitle', header: 'Product', render: (r) => r.productTitle },
    {
      key: 'rating',
      header: 'Rating',
      sortable: true,
      render: (r) => `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}`,
    },
    {
      key: 'text',
      header: 'Review',
      render: (r) => (
        <div className="review-cell">
          {r.title && <strong>{r.title}</strong>}
          <span>{r.text}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (r) => <span className={`pill pill-${r.status}`}>{r.status}</span>,
    },
    {
      key: 'actions',
      header: 'Moderate',
      render: (review) => (
        <div className="cell-actions">
          {review.status !== 'published' && (
            <button
              type="button"
              className="text-button"
              disabled={pendingId === review._id}
              onClick={() => moderate(review, 'published')}
            >
              Publish
            </button>
          )}
          {review.status !== 'rejected' && (
            <button
              type="button"
              className="text-button"
              disabled={pendingId === review._id}
              onClick={() => moderate(review, 'rejected')}
            >
              Reject
            </button>
          )}
          {review.status !== 'removed' && (
            <button
              type="button"
              className="text-button"
              disabled={pendingId === review._id}
              onClick={() => moderate(review, 'removed')}
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
      <p className="eyebrow">Reviews</p>
      <h2>Moderate reviews</h2>
      <TableToolbar
        table={table}
        searchable={false}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['pending', 'published', 'rejected', 'removed'],
          },
          { key: 'rating', label: 'Rating', options: ['1', '2', '3', '4', '5'] },
        ]}
      />
      {actionError && <ErrorState message={actionError} />}
      <AdminTable table={table} columns={columns} emptyLabel="No reviews match these filters." />
      <Pagination table={table} />

      {dialog && (
        <ReasonDialog
          title={`${dialog.status === 'rejected' ? 'Reject' : 'Remove'} this review`}
          confirmLabel={dialog.status === 'rejected' ? 'Reject review' : 'Remove review'}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => {
            const { review, status } = dialog
            setDialog(null)
            run(review._id, () => adminApi.setReviewStatus(review._id, status, reason))
          }}
        />
      )}
    </section>
  )
}
