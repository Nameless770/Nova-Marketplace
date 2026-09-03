import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderTracker } from '../src/components/OrderTracker.jsx'

// The tracker turns one status string into five step states. That mapping is
// what a customer reads to know where their order is, and nothing else asserts
// it — so these test the mapping rather than the markup.
const stepOf = (label) => screen.getByText(label).closest('.tracker-step')
const stateOf = (label) =>
  ['done', 'current', 'arrived', 'upcoming'].find((state) =>
    stepOf(label).classList.contains(`is-${state}`),
  )
const tickOf = (label) => stepOf(label).querySelector('.tracker-marker').textContent.trim()

describe('OrderTracker', () => {
  it('marks earlier steps done, the current one current, and later ones upcoming', () => {
    render(<OrderTracker status="shipped" statusHistory={[]} />)

    expect(stateOf('Confirmed')).toBe('done')
    expect(stateOf('Preparing')).toBe('done')
    expect(stateOf('Shipped')).toBe('current')
    expect(stateOf('Out for delivery')).toBe('upcoming')
    expect(stateOf('Delivered')).toBe('upcoming')
  })

  it('shows a delivered order as finished, not still in progress', () => {
    render(<OrderTracker status="delivered" statusHistory={[]} />)

    expect(stateOf('Confirmed')).toBe('done')
    expect(stateOf('Shipped')).toBe('done')
    // `current` would give the last step the hollow "you are here" marker every
    // in-progress step gets, and a delivered order then looks unfinished.
    expect(stateOf('Delivered')).toBe('arrived')
    expect(stateOf('Delivered')).not.toBe('current')
  })

  it('ticks the final step once it is reached', () => {
    render(<OrderTracker status="delivered" statusHistory={[]} />)
    expect(tickOf('Delivered')).toBe('✓')
  })

  it('leaves the final step unticked while it is still to come', () => {
    render(<OrderTracker status="shipped" statusHistory={[]} />)
    expect(tickOf('Delivered')).toBe('')
    // The step actually in progress stays hollow — that is the correct signal
    // for a step under way, and this change must not have flattened it.
    expect(tickOf('Shipped')).toBe('')
    expect(stateOf('Shipped')).toBe('current')
  })

  it('keeps the delivered step as the screen reader position', () => {
    render(<OrderTracker status="delivered" statusHistory={[]} />)
    expect(stepOf('Delivered').getAttribute('aria-current')).toBe('step')
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
