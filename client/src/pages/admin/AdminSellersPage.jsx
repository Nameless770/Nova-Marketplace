import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { AdminTable, Pagination, TableToolbar } from '../../components/admin/AdminTable.jsx'
import { ReasonDialog } from '../../components/admin/ReasonDialog.jsx'
import { useAdminTable } from '../../hooks/useAdminTable.js'
import { useRowAction } from '../../hooks/useRowAction.js'
import { adminApi } from '../../services/api.js'

export function AdminSellersPage() {
  const fetcher = useCallback((params) => adminApi.getSellers(params), [])
  const table = useAdminTable(fetcher, { sortBy: 'createdAt' })
  const { pendingId, actionError, run } = useRowAction(table.reload)
  const [dialog, setDialog] = useState(null)

  function decide(seller, status) {
    // The API requires a reason for rejection and suspension.
    if (['rejected', 'suspended'].includes(status)) {
      setDialog({ seller, status })
      return
    }
    run(seller._id, () => adminApi.setSellerStatus(seller._id, status))
  }

  const columns = [
    { key: 'storeName', header: 'Store', sortable: true, render: (s) => s.storeName },
    { key: 'slug', header: 'Slug', render: (s) => `/${s.slug}` },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (s) => <span className={`pill pill-${s.status}`}>{s.status}</span>,
    },
    {
      key: 'actions',
      header: 'Manage',
      render: (seller) => (
        <div className="cell-actions">
          {seller.status !== 'approved' && (
            <button
              type="button"
              className="text-button"
              disabled={pendingId === seller._id}
              onClick={() => decide(seller, 'approved')}
            >
              {seller.status === 'suspended' ? 'Reactivate' : 'Approve'}
            </button>
          )}
          {seller.status === 'pending' && (
            <button
              type="button"
              className="text-button"
              disabled={pendingId === seller._id}
              onClick={() => decide(seller, 'rejected')}
            >
              Reject
            </button>
          )}
          {seller.status === 'approved' && (
            <button
              type="button"
              className="text-button"
              disabled={pendingId === seller._id}
              onClick={() => decide(seller, 'suspended')}
            >
              Suspend
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <section>
      <p className="eyebrow">Sellers</p>
      <h2>Manage sellers</h2>
      <TableToolbar
        table={table}
        searchPlaceholder="Search by store name"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['pending', 'approved', 'rejected', 'suspended'],
          },
        ]}
      />
      {actionError && <ErrorState message={actionError} />}
      <AdminTable table={table} columns={columns} emptyLabel="No sellers match these filters." />
      <Pagination table={table} />

      {dialog && (
        <ReasonDialog
          title={`${dialog.status === 'rejected' ? 'Reject' : 'Suspend'} ${dialog.seller.storeName}`}
          confirmLabel={dialog.status === 'rejected' ? 'Reject seller' : 'Suspend seller'}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => {
            const { seller, status } = dialog
            setDialog(null)
            run(seller._id, () => adminApi.setSellerStatus(seller._id, status, reason))
          }}
        />
      )}
    </section>
  )
}
