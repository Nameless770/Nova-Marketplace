import { ORDER_STAGES as STAGES, ORDER_STATUS_LABELS } from '../utils/orderStatus.js'

const formatWhen = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

export function OrderTracker({ status, statusHistory = [] }) {
  // Most recent timestamp per status, so a step shows when it was reached.
  const reachedAt = new Map()
  for (const entry of statusHistory) reachedAt.set(entry.status, entry.at)

  if (status === 'cancelled' || status === 'refunded') {
    return (
      <div className="tracker-halted" role="status">
        <strong>{ORDER_STATUS_LABELS[status]}</strong>
        <span>
          {status === 'cancelled'
            ? 'This order was cancelled and will not be delivered.'
            : 'This order was refunded.'}
        </span>
      </div>
    )
  }

  // `pending` sits before the tracked path — nothing is complete yet.
  const currentIndex = STAGES.findIndex((stage) => stage.key === status)

  return (
    <ol className="order-tracker" aria-label="Order progress">
      {STAGES.map((stage, index) => {
        const state =
          currentIndex < 0
            ? 'upcoming'
            : index < currentIndex
              ? 'done'
              : index === currentIndex
                ? 'current'
                : 'upcoming'
        const when = formatWhen(reachedAt.get(stage.key))
        return (
          <li
            key={stage.key}
            className={`tracker-step is-${state}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="tracker-marker" aria-hidden="true">
              {state === 'done' ? '✓' : ''}
            </span>
            <span className="tracker-label">{stage.label}</span>
            <span className="tracker-blurb">{when || stage.blurb}</span>
          </li>
        )
      })}
    </ol>
  )
}
