import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { StatCard } from '../../components/StatCard.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { sellerApi } from '../../services/api.js'
import { formatMoney } from '../../utils/format.js'

export function SellerOverviewPage() {
  const load = useCallback(() => sellerApi.getDashboard(), [])
  const { data, status, error, reload } = useApiQuery(load, null)

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading overview" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const seller = data?.seller
  const products = data?.products ?? {}
  const orders = data?.orders ?? {}

  return (
    <section>
      <p className="eyebrow">Overview</p>
      <h2>{seller?.storeName || 'Your store'}</h2>
      <p className="seller-subtle">
        Store status: <strong>{seller?.status}</strong>
      </p>

      <div className="stat-grid">
        <StatCard
          label="Revenue (paid)"
          value={formatMoney(data?.revenueMinor ?? 0, 'USD')}
          hint={`${data?.paidOrders ?? 0} paid orders`}
        />
        <StatCard label="Orders" value={orders.total ?? 0} hint={`${orders.pending ?? 0} to fulfil`} />
        <StatCard
          label="Products"
          value={products.total ?? 0}
          hint={`${products.active ?? 0} active`}
        />
        <StatCard
          label="Low stock"
          value={data?.lowStockCount ?? 0}
          tone={data?.lowStockCount ? 'warn' : undefined}
          hint="Variants at or below threshold"
        />
      </div>

      <div className="seller-quicklinks">
        <Link to="/seller/orders">Fulfil orders</Link>
        <Link to="/seller/inventory">Restock inventory</Link>
        <Link to="/seller/revenue">See revenue detail</Link>
        <Link to="/seller/notifications">
          Notifications{data?.unreadNotifications ? ` (${data.unreadNotifications})` : ''}
        </Link>
      </div>
    </section>
  )
}
