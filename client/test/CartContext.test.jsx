import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The context talks to the API module, so that is the seam we control.
vi.mock('../src/services/api.js', () => ({
  cartApi: {
    get: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('../src/context/useAuth.js', () => ({
  useAuth: () => ({ user: { role: 'customer', _id: 'u1' } }),
}))

const { cartApi } = await import('../src/services/api.js')
const { CartProvider } = await import('../src/context/CartContext.jsx')
const { useCart } = await import('../src/context/useCart.js')

// Shapes a cart response the way the API actually returns it.
const cartResponse = (items) => ({ data: { data: { cart: { items } } } })
const line = (id, quantity) => ({ _id: id, productId: `p-${id}`, quantity })

function Probe() {
  const { count, items, addToCart, setQuantity, removeItem } = useCart()
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="lines">{items.length}</span>
      <button onClick={() => addToCart({ productId: 'p-1', variantId: 'v-1', quantity: 1 })}>
        add
      </button>
      <button onClick={() => setQuantity('a', 3)}>set-3</button>
      <button onClick={() => setQuantity('a', 0)}>set-0</button>
      <button onClick={() => removeItem('a')}>remove</button>
    </div>
  )
}

const renderCart = () =>
  render(
    <CartProvider>
      <Probe />
    </CartProvider>,
  )

describe('CartContext', () => {
  beforeEach(() => {
    cartApi.get.mockResolvedValue(cartResponse([line('a', 2)]))
  })

  it('sums quantities rather than counting lines', async () => {
    cartApi.get.mockResolvedValue(cartResponse([line('a', 2), line('b', 3)]))
    renderCart()

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('5'))
    expect(screen.getByTestId('lines')).toHaveTextContent('2')
  })

  it('updates the count from the add response without refetching', async () => {
    renderCart()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))

    cartApi.add.mockResolvedValue(cartResponse([line('a', 3)]))
    await userEvent.click(screen.getByText('add'))

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('3'))
    // One initial load only — the badge must not cost a second round trip.
    expect(cartApi.get).toHaveBeenCalledTimes(1)
  })

  // This is the behaviour behind "press − at 1 and it disappears".
  it('removes the line instead of updating when quantity drops below one', async () => {
    renderCart()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))

    cartApi.remove.mockResolvedValue(cartResponse([]))
    await userEvent.click(screen.getByText('set-0'))

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'))
    expect(cartApi.remove).toHaveBeenCalledWith('a')
    expect(cartApi.update).not.toHaveBeenCalled()
  })

  it('updates rather than removes for a quantity of one or more', async () => {
    renderCart()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))

    cartApi.update.mockResolvedValue(cartResponse([line('a', 3)]))
    await userEvent.click(screen.getByText('set-3'))

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('3'))
    expect(cartApi.update).toHaveBeenCalledWith('a', 3)
    expect(cartApi.remove).not.toHaveBeenCalled()
  })

  // A failed refresh must not blank the badge — the last known count is better
  // than a wrong zero.
  it('keeps the last known cart when a refresh fails', async () => {
    renderCart()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))

    cartApi.get.mockRejectedValue(new Error('network'))
    await userEvent.click(screen.getByText('set-3')) // triggers no refetch, but proves no crash
    expect(screen.getByTestId('count')).toBeInTheDocument()
  })
})
