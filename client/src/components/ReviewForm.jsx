import { useState } from 'react'
import { reviewApi } from '../services/api.js'

/**
 * Star rating plus a comment, for one purchased product.
 *
 * Offered on an order once it is delivered: rating something that has not
 * arrived is not a judgement of the product. The API's own rule is looser — it
 * accepts a review from any paid order — so this is a deliberate product
 * decision made in the UI rather than a duplicate of the server's check.
 *
 * `existing` is the customer's own review if they already left one, including a
 * pending one that no one else can see yet. Passing it switches the form to
 * editing rather than offering a second review the API would reject.
 */
const STARS = [1, 2, 3, 4, 5]

export function ReviewForm({ productId, productTitle, existing, onSaved }) {
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [hovered, setHovered] = useState(0)
  const [text, setText] = useState(existing?.text ?? '')
  const [open, setOpen] = useState(!existing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const shown = hovered || rating

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (rating < 1) {
      setError('Choose a star rating first.')
      return
    }
    // The API requires review text, so an empty comment would be rejected with a
    // validation error the shopper cannot act on. Say so before sending.
    if (!text.trim()) {
      setError('Add a short comment about the product.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = { rating, text: text.trim() }
      const response = existing
        ? await reviewApi.update(existing._id, body)
        : await reviewApi.create(productId, body)
      setDone(true)
      setOpen(false)
      onSaved?.(response.data.data.review)
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message ??
          'Could not save your review. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="review-done">
        <span className="review-stars is-static" aria-label={`Rated ${rating} out of 5`}>
          {STARS.map((star) => (
            <span key={star} className={star <= rating ? 'is-on' : ''} aria-hidden="true">
              ★
            </span>
          ))}
        </span>
        <span className="review-done-note">
          {done ? 'Thanks — your review is awaiting moderation.' : 'You reviewed this product.'}
        </span>
        <button type="button" className="link-button" onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>
    )
  }

  return (
    <form className="review-form" onSubmit={submit}>
      <fieldset className="review-stars-field">
        <legend>Your rating of {productTitle}</legend>
        <div className="review-stars" onMouseLeave={() => setHovered(0)}>
          {STARS.map((star) => (
            <button
              key={star}
              type="button"
              className={star <= shown ? 'is-on' : ''}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onFocus={() => setHovered(star)}
              onBlur={() => setHovered(0)}
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
              aria-pressed={rating === star}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label className="review-text">
        <span className="sr-only">Your review of {productTitle}</span>
        <textarea
          rows={3}
          value={text}
          maxLength={5000}
          placeholder="What did you think of it?"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {error && <p className="review-error">{error}</p>}
      <div className="review-actions">
        <button type="submit" className="add-to-cart" disabled={busy}>
          {busy ? 'Saving…' : existing ? 'Update review' : 'Submit review'}
        </button>
        {existing && (
          <button type="button" className="link-button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
