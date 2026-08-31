import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { StatCard } from '../../components/StatCard.jsx'
import { RevenueChart, StatusBars } from '../../components/admin/RevenueChart.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { adminApi } from '../../services/api.js'
import { formatMoney } from '../../utils/format.js'

const ranges = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

export function AdminOverviewPage() {
  const [days, setDays] = useState(30)
  const load = useCallback(
    () =>
      adminApi.getOverview({
        from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      }),
    [days],
  )
  const { data, status, error, reload } = useApiQuery(load, null)

  return (
    <section>
      <p className="eyebrow">Overview</p>
      <h2>Platform health</h2>

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

      {(status === 'loading' || status === 'idle') && <LoadingState label="Loading platform data" />}
      {status === 'error' && <ErrorState message={error} onRetry={reload} />}

      {status === 'success' && data && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Revenue (all time)"
              value={formatMoney(data.revenue.allTimeMinor, 'USD')}
              hint={`${data.revenue.paidOrdersAllTime} paid orders`}
            />
            <StatCard
              label="Revenue (period)"
              value={formatMoney(data.revenue.periodMinor, 'USD')}
              hint={`${data.revenue.paidOrdersInPeriod} paid orders`}
            />
            <StatCard label="Orders" value={data.orders.total} hint="All statuses" />
            <StatCard label="Customers" value={data.users.total} hint="All accounts" />
            <StatCard
              label="Sellers"
              value={data.sellers.total}
              hint={`${data.sellers.approved} approved · ${data.sellers.pending} pending`}
              tone={data.sellers.pending ? 'warn' : undefined}
            />
            <StatCard
              label="Products"
              value={data.products.total}
              hint={`${data.products.active} active`}
            />
            <StatCard
              label="Low stock"
              value={data.moderation.lowStock}
              tone={data.moderation.lowStock ? 'warn' : undefined}
              hint="Variants at/below threshold"
            />
            <StatCard
              label="Reviews to moderate"
              value={data.moderation.pendingReviews}
              tone={data.moderation.pendingReviews ? 'warn' : undefined}
              hint={`${data.moderation.activeCoupons} active coupons`}
            />
          </div>

          <h3>Daily revenue</h3>
          <RevenueChart series={data.series} />
          <p className="admin-subtle">Revenue counts only orders confirmed as paid by Stripe.</p>

          <div className="chart-row">
            <StatusBars title="Orders by status" counts={data.orders.byStatus} />
            <StatusBars title="Sellers by status" counts={data.sellers.byStatus} />
            <StatusBars title="Users by status" counts={data.users.byStatus} />
          </div>

          <h3>Top sellers by revenue</h3>
          {data.topSellers.length === 0 ? (
            <p className="admin-subtle">No paid sales yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="seller-table">
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Units sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topSellers.map((seller) => (
                    <tr key={seller.sellerId}>
                      <td>{seller.storeName}</td>
                      <td>{seller.unitsSold}</td>
                      <td>{formatMoney(seller.revenueMinor, 'USD')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
