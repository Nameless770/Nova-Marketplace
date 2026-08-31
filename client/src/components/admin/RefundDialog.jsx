import { useCallback, useRef, useState } from 'react'
import { ErrorState } from '../ErrorState.jsx'
import { LoadingState } from '../LoadingState.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { adminApi } from '../../services/api.js'
import { formatMoney } from '../../utils/format.js'

// Amounts are entered in major units for humans and sent in integer minor units,
// which is the only representation the API accepts.
function toMinor(value) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}

export function RefundDialog({ order, onClose, onRefunded }) {
  const load = useCallback(() => adminApi.getRefundable(order._id), [order._id])
  const { data, status, error, reload } = useApiQuery(load, null)

  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const idempotencyKey = useRef(crypto.randomUUID())

  const refundableMinor = data?.refundableMinor ?? 0
  const amountMinor = toMinor(amount)
  const overLimit = amountMinor !== null && amountMinor > refundableMinor
  const valid = amountMinor !== null && amountMinor > 0 && !overLimit && reason.trim().length > 0

  async function submit(event) {
    event.preventDefault()
    if (!valid) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await adminApi.createRefund(
        order._id,
        { amountMinor, reason: reason.trim(), restock },
        idempotencyKey.current,
      )
      await onRefunded()
      onClose()
    } catch (requestError) {
      setSubmitError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Refund order">
      <div className="dialog">
        <h3>Refund {order.orderNumber}</h3>

        {(status === 'loading' || status === 'idle') && <LoadingState label="Checking balance" />}
        {status === 'error' && <ErrorState message={error} onRetry={reload} />}

        {status === 'success' && (
          <form onSubmit={submit} className="dialog-form">
            <p className="admin-subtle">
              Refundable balance{' '}
              <strong>{formatMoney(refundableMinor, data?.currency || 'USD')}</strong> of{' '}
              {formatMoney(data?.ceilingMinor ?? 0, data?.currency || 'USD')}
            </p>

            <label>
              Amount ({data?.currency || 'USD'})
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={(refundableMinor / 100).toFixed(2)}
                value={amount}
                autoFocus
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            {overLimit && (
              <p className="dialog-warn">Amount exceeds the refundable balance.</p>
            )}

            <label>
              Reason (required)
              <textarea
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </label>

            <label className="inline-toggle">
              <input
                type="checkbox"
                checked={restock}
                onChange={(event) => setRestock(event.target.checked)}
              />
              Return the units to sellable stock
            </label>

            {submitError && <ErrorState message={submitError} />}

            <div className="dialog-actions">
              <button type="button" className="text-button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-action" disabled={!valid || submitting}>
                {submitting ? 'Refunding' : 'Issue refund'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
