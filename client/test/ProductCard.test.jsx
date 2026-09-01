import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const addToCart = vi.fn()
const setQuantity = vi.fn()
const addWish = vi.fn()
const removeWish = vi.fn()
let cartItems = []
let wishItems = []

vi.mock('../src/context/useCart.js', () => ({
  useCart: () => ({ items: cartItems, addToCart, setQuantity }),
}))
vi.mock('../src/context/useWishlist.js', () => ({
  useWishlist: () => ({ items: wishItems, add: addWish, remove: removeWish }),
}))
vi.mock('../src/context/useAuth.js', () => ({
  useAuth: () => ({ user: { role: 'customer', _id: 'u1' } }),
}))
vi.mock('../src/services/api.js', () => ({
  catalogApi: {
    getProduct: vi.fn(async () => ({
      data: { data: { product: { variants: [{ _id: 'v1', status: 'active' }] } } },
    })),
  },
}))

const { ProductCard } = await import('../src/components/ProductCard.jsx')

const product = {
  _id: 'p1',
  title: 'Nova Reading Light',
  brand: 'Nova',
  currentPriceMinor: 17810,
  currency: 'USD',
  ratingAverage: 4.5,
  images: [{ url: 'https://example.test/a.jpg', alt: 'lamp' }],
}

const renderCard = () =>
  render(
    <MemoryRouter>
      <ProductCard product={product} />
    </MemoryRouter>,
  )

describe('ProductCard quick actions', () => {
  beforeEach(() => {
    cartItems = []
    wishItems = []
  })

  it('shows Add to cart when the product is not in the cart', () => {
    renderCard()
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument()
  })

  it('resolves a variant before adding, since the listing carries none', async () => {
    renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    await waitFor(() =>
      expect(addToCart).toHaveBeenCalledWith({ productId: 'p1', variantId: 'v1', quantity: 1 }),
    )
  })

  it('shows the quantity once the product is in the cart', () => {
    cartItems = [{ _id: 'c1', productId: 'p1', quantity: 2 }]
    renderCard()
    expect(screen.getByRole('button', { name: /2 in cart/ })).toBeInTheDocument()
  })

  it('expands to a stepper when the quantity is clicked', async () => {
    cartItems = [{ _id: 'c1', productId: 'p1', quantity: 2 }]
    renderCard()

    await userEvent.click(screen.getByRole('button', { name: /2 in cart/ }))

    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeInTheDocument()
  })

  // At a quantity of one, minus means remove — the control says so, so a shopper
  // is not surprised by the item vanishing.
  it('labels the minus button as remove when only one remains', async () => {
    cartItems = [{ _id: 'c1', productId: 'p1', quantity: 1 }]
    renderCard()

    await userEvent.click(screen.getByRole('button', { name: /1 in cart/ }))
    expect(screen.getByRole('button', { name: 'Remove from cart' })).toBeInTheDocument()
  })

  it('steps the quantity through the shared cart', async () => {
    cartItems = [{ _id: 'c1', productId: 'p1', quantity: 2 }]
    renderCard()

    await userEvent.click(screen.getByRole('button', { name: /2 in cart/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))

    await waitFor(() => expect(setQuantity).toHaveBeenCalledWith('c1', 3))
  })

  it('toggles the wishlist rather than only ever adding', async () => {
    renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Save to wishlist' }))
    await waitFor(() => expect(addWish).toHaveBeenCalled())

    wishItems = [{ _id: 'w1', productId: 'p1' }]
    renderCard()
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove from wishlist' })[0])
    await waitFor(() => expect(removeWish).toHaveBeenCalledWith('w1'))
  })

  it('hides the quick actions from users who cannot use them', async () => {
    vi.resetModules()
    vi.doMock('../src/context/useAuth.js', () => ({
      useAuth: () => ({ user: { role: 'seller', _id: 's1' } }),
    }))
    const { ProductCard: SellerCard } = await import('../src/components/ProductCard.jsx')

    render(
      <MemoryRouter>
        <SellerCard product={product} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Add to cart' })).toBeNull()
  })
})
