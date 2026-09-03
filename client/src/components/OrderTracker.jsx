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
  const lastIndex = STAGES.length - 1

  return (
    <ol className="order-tracker" aria-label="Order progress">
      {STAGES.map((stage, index) => {
        // The last stage is an endpoint, not a step still under way. Marking it
        // `current` gave it the hollow "you are here" marker every other
        // in-progress step gets, which made a delivered order look unfinished.
        const state =
          currentIndex < 0
            ? 'upcoming'
            : index < currentIndex
              ? 'done'
              : index === currentIndex
                ? index === lastIndex
                  ? 'arrived'
                  : 'current'
                : 'upcoming'
        const complete = state === 'done' || state === 'arrived'
        const when = formatWhen(reachedAt.get(stage.key))
        return (
          <li
            key={stage.key}
            className={`tracker-step is-${state}`}
            // Still where the order is, even though it is also the end of the
            // road — a screen reader should land here.
            aria-current={index === currentIndex ? 'step' : undefined}
          >
            <span className="tracker-marker" aria-hidden="true">
              {complete ? '✓' : ''}
            </span>
            <span className="tracker-label">{stage.label}</span>
            <span className="tracker-blurb">{when || stage.blurb}</span>
          </li>
        )
      })}
    </ol>
  )
}
