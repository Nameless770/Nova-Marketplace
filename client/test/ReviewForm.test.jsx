import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const create = vi.fn()
const update = vi.fn()

vi.mock('../src/services/api.js', () => ({
  reviewApi: {
    create: (...args) => create(...args),
    update: (...args) => update(...args),
  },
}))

const { ReviewForm } = await import('../src/components/ReviewForm.jsx')

const review = (overrides = {}) => ({
  _id: 'r1',
  rating: 4,
  text: 'Solid build.',
  status: 'pending',
  ...overrides,
})

beforeEach(() => {
  create.mockReset()
  update.mockReset()
  create.mockResolvedValue({ data: { data: { review: review() } } })
  update.mockResolvedValue({ data: { data: { review: review({ rating: 5 }) } } })
})

const setup = (props = {}) =>
  render(<ReviewForm productId="p1" productTitle="Marlow Headphones" {...props} />)

describe('rating a delivered product', () => {
  it('offers five stars', () => {
    setup()
    expect(screen.getAllByRole('button', { name: /star/i })).toHaveLength(5)
  })

  it('will not submit without a rating', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }))

    expect(await screen.findByText(/choose a star rating/i)).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('will not submit without a comment', async () => {
    setup()
    // The API requires review text, so an empty comment has to be caught here
    // rather than coming back as a validation error the shopper cannot act on.
    await userEvent.click(screen.getByRole('button', { name: '4 stars' }))
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }))

    expect(await screen.findByText(/add a short comment/i)).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('sends the rating and comment, then confirms', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: '4 stars' }))
    await userEvent.type(screen.getByRole('textbox'), 'Arrived quickly.')
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }))

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith('p1', { rating: 4, text: 'Arrived quickly.' }),
    )
    expect(await screen.findByText(/awaiting moderation/i)).toBeTruthy()
  })

  it('surfaces the API error rather than failing silently', async () => {
    create.mockRejectedValue({
      response: { data: { error: { message: 'You already reviewed this product' } } },
    })
    setup()
    await userEvent.click(screen.getByRole('button', { name: '5 stars' }))
    await userEvent.type(screen.getByRole('textbox'), 'Great.')
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }))

    expect(await screen.findByText(/already reviewed/i)).toBeTruthy()
  })
})

describe('a product already reviewed', () => {
  it('shows the existing rating instead of an empty form', () => {
    // The orders page looks this up after mount, so the value arrives as a prop
    // rather than being known at first render. Getting this wrong offered a
    // blank form for a product already reviewed, and the API then rejected it.
    setup({ existing: review() })

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/you reviewed this product/i)).toBeTruthy()
    expect(screen.getByLabelText(/rated 4 out of 5/i)).toBeTruthy()
  })

  it('reopens prefilled and updates rather than creating a duplicate', async () => {
    setup({ existing: review() })
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))

    expect(screen.getByRole('textbox')).toHaveValue('Solid build.')
    await userEvent.click(screen.getByRole('button', { name: '5 stars' }))
    await userEvent.click(screen.getByRole('button', { name: /update review/i }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('r1', { rating: 5, text: 'Solid build.' }),
    )
    expect(create).not.toHaveBeenCalled()
  })
})
