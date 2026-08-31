import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { sellerApi } from '../../services/api.js'

export function SellerInventoryPage() {
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const load = useCallback(
    () => sellerApi.getInventory(lowStockOnly ? { isLowStock: 'true' } : {}),
    [lowStockOnly],
  )
  const { data, status, error, reload } = useApiQuery(load, null)

  const items = data?.inventory ?? []

  return (
    <section>
      <p className="eyebrow">Inventory</p>
      <h2>Stock levels</h2>

      <label className="inline-toggle">
        <input
          type="checkbox"
          checked={lowStockOnly}
          onChange={(event) => setLowStockOnly(event.target.checked)}
        />
        Show low stock only
      </label>

      {(status === 'loading' || status === 'idle') && <LoadingState label="Loading inventory" />}
      {status === 'error' && <ErrorState message={error} onRetry={reload} />}

      {status === 'success' &&
        (items.length === 0 ? (
          <p className="seller-subtle">
            {lowStockOnly ? 'Nothing is running low.' : 'No inventory records yet.'}
          </p>
        ) : (
          <table className="seller-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id}>
                  <td>{item.sku}</td>
                  <td>{item.quantityOnHand}</td>
                  <td>{item.quantityReserved}</td>
                  <td className={item.quantityAvailable === 0 ? 'cell-warn' : undefined}>
                    {item.quantityAvailable}
                  </td>
                  <td>
                    <span className={`pill pill-${item.status}`}>{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  )
}
