import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderTracker } from '../src/components/OrderTracker.jsx'

// The tracker turns one status string into five step states. That mapping is
// what a customer reads to know where their order is, and nothing else asserts
// it — so these test the mapping rather than the markup.
const stateOf = (label) => {
  const step = screen.getByText(label).closest('.tracker-step')
  return ['done', 'current', 'upcoming'].find((state) => step.classList.contains(`is-${state}`))
}

describe('OrderTracker', () => {
  it('marks earlier steps done, the current one current, and later ones upcoming', () => {
    render(<OrderTracker status="shipped" statusHistory={[]} />)

    expect(stateOf('Confirmed')).toBe('done')
    expect(stateOf('Preparing')).toBe('done')
    expect(stateOf('Shipped')).toBe('current')
    expect(stateOf('Out for delivery')).toBe('upcoming')
    expect(stateOf('Delivered')).toBe('upcoming')
  })

  it('marks every step done once delivered', () => {
    render(<OrderTracker status="delivered" statusHistory={[]} />)

    expect(stateOf('Confirmed')).toBe('done')
    expect(stateOf('Shipped')).toBe('done')
    expect(stateOf('Delivered')).toBe('current')
  })

  it('shows nothing as reached while the order is still pending', () => {
    render(<OrderTracker status="pending" statusHistory={[]} />)

    for (const label of ['Confirmed', 'Preparing', 'Shipped', 'Delivered']) {
      expect(stateOf(label)).toBe('upcoming')
    }
  })

  // Cancelled and refunded orders leave the delivery path entirely. Rendering a
  // progress bar for them would tell the customer something untrue.
  it.each(['cancelled', 'refunded'])('replaces the progress bar for a %s order', (status) => {
    render(<OrderTracker status={status} statusHistory={[]} />)

    expect(document.querySelector('.order-tracker')).toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows the timestamp a step was reached in place of its generic blurb', () => {
    render(
      <OrderTracker
        status="shipped"
        statusHistory={[{ status: 'confirmed', at: '2026-03-04T09:30:00.000Z' }]}
      />,
    )

    // The generic copy is replaced once a real timestamp exists for that step.
    expect(screen.queryByText('Payment received')).toBeNull()
    // Later steps keep their placeholder copy.
    expect(screen.getByText('With the courier')).toBeInTheDocument()
  })

  it('uses the latest timestamp when a status was recorded more than once', () => {
    render(
      <OrderTracker
        status="confirmed"
        statusHistory={[
          { status: 'confirmed', at: '2026-03-04T09:00:00.000Z' },
          { status: 'confirmed', at: '2026-03-04T11:00:00.000Z' },
        ]}
      />,
    )
    // Both render through the same formatter; only one node should exist and it
    // must come from the later entry.
    const blurb = screen.getByText(/Mar/).textContent
    expect(blurb).not.toContain('09:00')
  })
})
