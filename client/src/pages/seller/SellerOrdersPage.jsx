import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { sellerApi } from '../../services/api.js'
import { formatMoney } from '../../utils/format.js'

// Mirrors the server-side transition map; the API re-validates every change.
const nextStatuses = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
  refunded: [],
}

export function SellerOrdersPage() {
  const load = useCallback(() => sellerApi.getOrders(), [])
  const { data, status, error, reload } = useApiQuery(load, null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  async function advance(sellerOrderId, nextStatus) {
    setPendingId(sellerOrderId)
    setActionError(null)
    try {
      await sellerApi.updateOrderStatus(sellerOrderId, nextStatus)
      await reload()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setPendingId(null)
    }
  }

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading orders" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const orders = data?.items ?? []

  return (
    <section>
      <p className="eyebrow">Orders</p>
      <h2>Your orders</h2>
      {actionError && <ErrorState message={actionError} />}

      {orders.length === 0 ? (
        <p className="seller-subtle">No orders yet.</p>
      ) : (
        <table className="seller-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Fulfilment</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order._id}>
                <td>{order.sellerOrderNumber}</td>
                <td>{order.itemCount}</td>
                <td>{formatMoney(order.totalMinor, 'USD')}</td>
                <td>
                  <span className={`pill pill-${order.status}`}>{order.status}</span>
                </td>
                <td className="cell-actions">
                  {(nextStatuses[order.status] ?? []).map((next) => (
                    <button
                      key={next}
                      type="button"
                      className="text-button"
                      disabled={pendingId === order._id}
                      onClick={() => advance(order._id, next)}
                    >
                      Mark {next}
                    </button>
                  ))}
                  {(nextStatuses[order.status] ?? []).length === 0 && (
                    <span className="seller-subtle">No action</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
