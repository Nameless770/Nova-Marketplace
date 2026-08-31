import { useCallback, useState } from 'react'
import { AdminTable, Pagination, TableToolbar } from '../../components/admin/AdminTable.jsx'
import { RefundDialog } from '../../components/admin/RefundDialog.jsx'
import { useAdminTable } from '../../hooks/useAdminTable.js'
import { adminApi } from '../../services/api.js'
import { formatMoney } from '../../utils/format.js'

const REFUNDABLE = ['paid', 'partially_refunded']

export function AdminOrdersPage() {
  const fetcher = useCallback((params) => adminApi.getOrders(params), [])
  const table = useAdminTable(fetcher, { sortBy: 'createdAt' })
  const [refunding, setRefunding] = useState(null)

  const columns = [
    { key: 'orderNumber', header: 'Order', render: (order) => order.orderNumber },
    {
      key: 'totalMinor',
      header: 'Total',
      sortable: true,
      render: (order) => formatMoney(order.totalMinor, order.currency),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (order) => <span className={`pill pill-${order.status}`}>{order.status}</span>,
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (order) => (
        <span className={`pill pill-${order.paymentStatus}`}>{order.paymentStatus}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Placed',
      sortable: true,
      render: (order) => new Date(order.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Manage',
      render: (order) =>
        REFUNDABLE.includes(order.paymentStatus) ? (
          <button type="button" className="text-button" onClick={() => setRefunding(order)}>
            Refund
          </button>
        ) : (
          <span className="admin-subtle">&mdash;</span>
        ),
    },
  ]

  return (
    <section>
      <p className="eyebrow">Orders</p>
      <h2>Platform orders</h2>
      <TableToolbar
        table={table}
        searchPlaceholder="Search by order number"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              'pending',
              'confirmed',
              'processing',
              'shipped',
              'delivered',
              'cancelled',
              'refunded',
            ],
          },
          {
            key: 'paymentStatus',
            label: 'Payment',
            options: ['pending', 'paid', 'failed', 'partially_refunded', 'refunded'],
          },
        ]}
      />
      <AdminTable table={table} columns={columns} emptyLabel="No orders match these filters." />
      <Pagination table={table} />

      {refunding && (
        <RefundDialog
          key={refunding._id}
          order={refunding}
          onClose={() => setRefunding(null)}
          onRefunded={table.reload}
        />
      )}
    </section>
  )
}
