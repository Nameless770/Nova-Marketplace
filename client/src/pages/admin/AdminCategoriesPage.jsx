import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { AdminTable, Pagination, TableToolbar } from '../../components/admin/AdminTable.jsx'
import { useAdminTable } from '../../hooks/useAdminTable.js'
import { useRowAction } from '../../hooks/useRowAction.js'
import { adminApi } from '../../services/api.js'

export function AdminCategoriesPage() {
  const fetcher = useCallback((params) => adminApi.getCategories(params), [])
  const table = useAdminTable(fetcher, { sortBy: 'sortOrder', sortDir: 'asc' })
  const { pendingId, actionError, run } = useRowAction(table.reload)

  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  async function createCategory(event) {
    event.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      await adminApi.createCategory({ name: name.trim() })
      setName('')
      await table.reload()
    } catch (requestError) {
      setCreateError(requestError.message)
    } finally {
      setCreating(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Name', sortable: true, render: (c) => c.name },
    { key: 'slug', header: 'Slug', render: (c) => c.slug },
    { key: 'sortOrder', header: 'Order', sortable: true, render: (c) => c.sortOrder },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <span className={`pill pill-${c.status}`}>{c.status}</span>,
    },
    {
      key: 'actions',
      header: 'Manage',
      render: (category) => (
        <button
          type="button"
          className="text-button"
          disabled={pendingId === category._id}
          onClick={() =>
            run(category._id, () =>
              adminApi.updateCategory(category._id, {
                status: category.status === 'active' ? 'inactive' : 'active',
              }),
            )
          }
        >
          {category.status === 'active' ? 'Deactivate' : 'Activate'}
        </button>
      ),
    },
  ]

  return (
    <section>
      <p className="eyebrow">Categories</p>
      <h2>Manage categories</h2>

      <form onSubmit={createCategory} className="inline-form">
        <input
          value={name}
          placeholder="New category name"
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <button className="primary-action" disabled={creating || !name.trim()}>
          {creating ? 'Adding' : 'Add category'}
        </button>
      </form>
      {createError && <ErrorState message={createError} />}

      <TableToolbar
        table={table}
        searchPlaceholder="Search by name"
        filters={[{ key: 'status', label: 'Status', options: ['active', 'inactive', 'removed'] }]}
      />
      {actionError && <ErrorState message={actionError} />}
      <AdminTable table={table} columns={columns} emptyLabel="No categories match these filters." />
      <Pagination table={table} />
    </section>
  )
}
