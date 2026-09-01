import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/api.js', () => ({
  aiApi: { shoppingAssistant: vi.fn(), search: vi.fn() },
  catalogApi: { getProduct: vi.fn() },
}))
vi.mock('../src/context/useCart.js', () => ({
  useCart: () => ({ addToCart: vi.fn() }),
}))

const { aiApi } = await import('../src/services/api.js')
const { AssistantPage } = await import('../src/pages/AssistantPage.jsx')

const renderPage = () =>
  render(
    <MemoryRouter>
      <AssistantPage />
    </MemoryRouter>,
  )

const answer = (overrides = {}) => ({
  data: {
    data: {
      message: 'Here are some options.',
      recommendations: [],
      noMatch: false,
      ...overrides,
    },
  },
})

const recommendation = {
  productId: 'p1',
  title: 'Nova Reading Light',
  brand: 'Nova',
  reason: 'Warm bulb, dimmable.',
  priceMinor: 17810,
  currency: 'USD',
  ratingAverage: 4.5,
  ratingCount: 12,
  inStock: true,
  imageUrl: 'https://example.test/a.jpg',
}

describe('AssistantPage', () => {
  beforeEach(() => {
    aiApi.shoppingAssistant.mockReset()
  })

  it('offers example prompts before anything has been asked', () => {
    renderPage()
    expect(
      screen.getAllByRole('button', { name: /under \$200|friend|cycle|Desk/ }).length,
    ).toBeGreaterThan(0)
  })

  it('renders each recommendation with the model reason and a live price', async () => {
    aiApi.shoppingAssistant.mockResolvedValue(
      answer({ message: 'Two warm options.', recommendations: [recommendation] }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText(/looking for/i), 'reading light')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => expect(screen.getByText('Two warm options.')).toBeInTheDocument())
    expect(screen.getByText('Nova Reading Light')).toBeInTheDocument()
    expect(screen.getByText('Warm bulb, dimmable.')).toBeInTheDocument()
    // Price comes from the server payload, never from the model's prose.
    expect(screen.getByText(/178\.10/)).toBeInTheDocument()
  })

  // The assistant is the most failure-prone surface in the app: it depends on a
  // third-party model that can be rate-limited, unconfigured, or out of credit.
  it('surfaces the server error message instead of failing silently', async () => {
    aiApi.shoppingAssistant.mockRejectedValue(
      new Error('The assistant is unavailable: the API account is out of credit.'),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText(/looking for/i), 'anything')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => expect(screen.getByText(/out of credit/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('offers a way out when nothing matched', async () => {
    aiApi.shoppingAssistant.mockResolvedValue(
      answer({ message: "I couldn't find anything.", noMatch: true }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText(/looking for/i), 'a submarine')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => expect(screen.getByText(/couldn't find anything/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /browse everything/i })).toBeInTheDocument()
  })

  it('will not submit an empty question', async () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
    expect(aiApi.shoppingAssistant).not.toHaveBeenCalled()
  })

  it('shows a thinking state while the request is in flight', async () => {
    let resolve
    aiApi.shoppingAssistant.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText(/looking for/i), 'lamp')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/Reading the catalogue/)
    resolve(answer())
  })
})
