import { useCallback } from 'react'
import { AdminTable, Pagination, TableToolbar } from '../../components/admin/AdminTable.jsx'
import { useAdminTable } from '../../hooks/useAdminTable.js'
import { adminApi } from '../../services/api.js'

export function AdminInventoryPage() {
  const fetcher = useCallback((params) => adminApi.getInventory(params), [])
  const table = useAdminTable(fetcher, { sortBy: 'quantityAvailable', sortDir: 'asc' })

  const columns = [
    { key: 'sku', header: 'SKU', render: (item) => item.sku },
    { key: 'quantityOnHand', header: 'On hand', render: (item) => item.quantityOnHand },
    { key: 'quantityReserved', header: 'Reserved', render: (item) => item.quantityReserved },
    {
      key: 'quantityAvailable',
      header: 'Available',
      sortable: true,
      render: (item) => (
        <span className={item.quantityAvailable === 0 ? 'cell-warn' : undefined}>
          {item.quantityAvailable}
        </span>
      ),
    },
    { key: 'lowStockThreshold', header: 'Threshold', render: (item) => item.lowStockThreshold },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <span className={`pill pill-${item.status}`}>{item.status}</span>,
    },
  ]

  return (
    <section>
      <p className="eyebrow">Inventory</p>
      <h2>Platform inventory</h2>
      <TableToolbar
        table={table}
        searchPlaceholder="Search by SKU"
        filters={[
          { key: 'lowStock', label: 'Low stock', options: ['true'] },
          { key: 'status', label: 'Status', options: ['active', 'out_of_stock'] },
        ]}
      />
      <AdminTable table={table} columns={columns} emptyLabel="No inventory matches these filters." />
      <Pagination table={table} />
    </section>
  )
}
