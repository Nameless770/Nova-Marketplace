import { useState } from 'react'

/**
 * The API requires a written reason for destructive moderation (rejecting or
 * suspending a seller, rejecting or removing a review). This collects it.
 */
export function ReasonDialog({ title, confirmLabel, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog">
        <h3>{title}</h3>
        <label>
          Reason (required)
          <textarea
            rows={4}
            value={reason}
            autoFocus
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-action"
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
