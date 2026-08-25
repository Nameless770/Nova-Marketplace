import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { cartApi } from '../services/api.js'

export function CartPage() {
  const load = useCallback(() => cartApi.get(), [])
  const { data, status, error, reload } = useApiQuery(load, { cart: { items: [] } })
  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading cart" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />
  const cart = data?.cart || data
  if (!cart?.items?.length) return <div className="empty-state"><p className="eyebrow">Your basket</p><h2>Nothing here yet.</h2><Link className="primary-action" to="/products">Explore products</Link></div>
  async function update(item, quantity) { await cartApi.update(item._id, quantity); reload() }
  async function remove(item) { await cartApi.remove(item._id); reload() }
  return <section><div className="section-heading"><div><p className="eyebrow">Your basket</p><h2>Cart</h2></div><button className="secondary-action" onClick={async () => { await cartApi.clear(); reload() }}>Clear cart</button></div><div className="stack-list">{cart.items.map((item) => <article className="line-item" key={item._id}><div><h3>{item.productId}</h3><span>{item.availability} · {item.currentPriceMinor ?? item.unitPriceMinor} minor units</span></div><div className="quantity"><button onClick={() => update(item, Math.max(1, item.quantity - 1))}>−</button><strong>{item.quantity}</strong><button onClick={() => update(item, item.quantity + 1)}>+</button></div><button className="text-button" onClick={() => remove(item)}>Remove</button></article>)}</div><Link className="primary-action checkout-link" to="/checkout">Continue to checkout</Link></section>
}
