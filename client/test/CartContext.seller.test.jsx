import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Its own file because the signed-in role is decided at module load: mocking it
// per-test would leave the provider and the consumer holding different contexts.
vi.mock('../src/services/api.js', () => ({
  cartApi: { get: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../src/context/useAuth.js', () => ({
  useAuth: () => ({ user: { role: 'seller', _id: 's1' } }),
}))

const { cartApi } = await import('../src/services/api.js')
const { CartProvider } = await import('../src/context/CartContext.jsx')
const { useCart } = await import('../src/context/useCart.js')

function Probe() {
  const { count } = useCart()
  return <span data-testid="count">{count}</span>
}

describe('CartContext for a non-shopper', () => {
  // Cart is customer-only on the API. Fetching one for a seller would be a
  // guaranteed 403 on every page load.
  it('never requests a cart for a seller', async () => {
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'))
    expect(cartApi.get).not.toHaveBeenCalled()
  })
})
