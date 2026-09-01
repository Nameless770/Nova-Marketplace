import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { StatCard } from '../../components/StatCard.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { sellerApi } from '../../services/api.js'
import { formatMoney } from '../../utils/format.js'

const ranges = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function SellerRevenuePage() {
  const [days, setDays] = useState(30)
  const load = useCallback(() => sellerApi.getAnalytics({ from: isoDaysAgo(days) }), [days])
  const { data, status, error, reload } = useApiQuery(load, null)

  const metrics = data?.metrics ?? {}
  const bestSellers = data?.bestSellers ?? []
  const lowStock = data?.lowStock ?? []

  return (
    <section>
      <p className="eyebrow">Revenue</p>
      <h2>Sales analytics</h2>

      <div className="range-tabs" role="group" aria-label="Date range">
        {ranges.map((range) => (
          <button
            key={range.days}
            type="button"
            className={range.days === days ? 'range-tab range-active' : 'range-tab'}
            onClick={() => setDays(range.days)}
          >
            {range.label}
          </button>
        ))}
      </div>

      {(status === 'loading' || status === 'idle') && <LoadingState label="Loading analytics" />}
      {status === 'error' && <ErrorState message={error} onRetry={reload} />}

      {status === 'success' && (
        <>
          <div className="stat-grid">
            <StatCard label="Revenue" value={formatMoney(metrics.revenueMinor ?? 0, 'USD')} />
            <StatCard label="Total sales (units)" value={metrics.unitsSold ?? 0} />
            <StatCard label="Paid orders" value={metrics.orders ?? 0} />
            <StatCard
              label="Discounts given"
              value={formatMoney(metrics.discountMinor ?? 0, 'USD')}
            />
          </div>
          <p className="seller-subtle">Revenue counts only orders confirmed as paid by Stripe.</p>

          <h3>Best-selling products</h3>
          {bestSellers.length === 0 ? (
            <p className="seller-subtle">No paid sales in this period yet.</p>
          ) : (
            <table className="seller-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Units sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {bestSellers.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.title}</td>
                    <td>{item.unitsSold}</td>
                    <td>{formatMoney(item.revenueMinor, 'USD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Low-stock products</h3>
          {lowStock.length === 0 ? (
            <p className="seller-subtle">Nothing is running low.</p>
          ) : (
            <table className="seller-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Available</th>
                  <th>Threshold</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((item) => (
                  <tr key={item._id}>
                    <td>{item.sku}</td>
                    <td className={item.quantityAvailable === 0 ? 'cell-warn' : undefined}>
                      {item.quantityAvailable}
                    </td>
                    <td>{item.lowStockThreshold}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
