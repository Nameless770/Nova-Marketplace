import { useCallback } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { AdminTable, Pagination, TableToolbar } from '../../components/admin/AdminTable.jsx'
import { useAdminTable } from '../../hooks/useAdminTable.js'
import { useRowAction } from '../../hooks/useRowAction.js'
import { adminApi } from '../../services/api.js'

export function AdminCustomersPage() {
  const fetcher = useCallback((params) => adminApi.getUsers(params), [])
  const table = useAdminTable(fetcher, { sortBy: 'createdAt' })
  const { pendingId, actionError, run } = useRowAction(table.reload)

  const columns = [
    { key: 'email', header: 'Email', sortable: true, render: (user) => user.email },
    {
      key: 'name',
      header: 'Name',
      render: (user) => `${user.firstName} ${user.lastName}`,
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (user) => <span className={`pill pill-${user.role}`}>{user.role}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (user) => <span className={`pill pill-${user.status}`}>{user.status}</span>,
    },
    {
      key: 'actions',
      header: 'Manage',
      render: (user) =>
        user.role === 'admin' ? (
          <span className="admin-subtle">Protected</span>
        ) : (
          <button
            type="button"
            className="text-button"
            disabled={pendingId === user._id}
            onClick={() =>
              run(user._id, () =>
                adminApi.setUserStatus(user._id, user.status === 'active' ? 'suspended' : 'active'),
              )
            }
          >
            {user.status === 'active' ? 'Suspend' : 'Reactivate'}
          </button>
        ),
    },
  ]

  return (
    <section>
      <p className="eyebrow">Customers</p>
      <h2>Manage users</h2>
      <TableToolbar
        table={table}
        searchPlaceholder="Search by email or name"
        filters={[
          { key: 'role', label: 'Role', options: ['customer', 'seller', 'admin'] },
          { key: 'status', label: 'Status', options: ['active', 'suspended', 'pending'] },
        ]}
      />
      {actionError && <ErrorState message={actionError} />}
      <AdminTable table={table} columns={columns} emptyLabel="No users match these filters." />
      <Pagination table={table} />
    </section>
  )
}
