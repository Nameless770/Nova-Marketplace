import { useCallback } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { AdminTable, Pagination, TableToolbar } from '../../components/admin/AdminTable.jsx'
import { useAdminTable } from '../../hooks/useAdminTable.js'
import { useRowAction } from '../../hooks/useRowAction.js'
import { adminApi } from '../../services/api.js'
import { formatMoney } from '../../utils/format.js'

function discountLabel(coupon) {
  return coupon.discountType === 'percentage'
    ? `${coupon.discountValue}%`
    : formatMoney(coupon.discountValue, coupon.currency || 'USD')
}

export function AdminCouponsPage() {
  const fetcher = useCallback((params) => adminApi.getCoupons(params), [])
  const table = useAdminTable(fetcher, { sortBy: 'createdAt' })
  const { pendingId, actionError, run } = useRowAction(table.reload)

  const columns = [
    { key: 'code', header: 'Code', sortable: true, render: (c) => c.code },
    { key: 'ownerType', header: 'Owner', render: (c) => c.ownerType },
    { key: 'discount', header: 'Discount', render: discountLabel },
    {
      key: 'usageCount',
      header: 'Used',
      sortable: true,
      render: (c) => `${c.usageCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}`,
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      sortable: true,
      render: (c) => new Date(c.expiresAt).toLocaleDateString(),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <span className={`pill pill-${c.status}`}>{c.status}</span>,
    },
    {
      key: 'actions',
      header: 'Manage',
      render: (coupon) =>
        coupon.status === 'expired' ? (
          <span className="admin-subtle">Expired</span>
        ) : (
          <button
            type="button"
            className="text-button"
            disabled={pendingId === coupon._id}
            onClick={() =>
              run(coupon._id, () =>
                adminApi.setCouponStatus(
                  coupon._id,
                  coupon.status === 'active' ? 'inactive' : 'active',
                ),
              )
            }
          >
            {coupon.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
        ),
    },
  ]

  return (
    <section>
      <p className="eyebrow">Coupons</p>
      <h2>Manage coupons</h2>
      <TableToolbar
        table={table}
        searchPlaceholder="Search by code"
        filters={[
          { key: 'status', label: 'Status', options: ['active', 'inactive', 'expired'] },
          { key: 'ownerType', label: 'Owner', options: ['platform', 'seller'] },
        ]}
      />
      {actionError && <ErrorState message={actionError} />}
      <AdminTable table={table} columns={columns} emptyLabel="No coupons match these filters." />
      <Pagination table={table} />
    </section>
  )
}
