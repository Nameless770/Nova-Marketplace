import { useCallback, useState } from 'react'
import { useAuth } from '../context/useAuth.js'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { qaApi } from '../services/api.js'
import { ErrorState } from './ErrorState.jsx'
import { LoadingState } from './LoadingState.jsx'

/**
 * Questions shoppers have asked about a product, and the seller's answers.
 *
 * The whole subsystem already existed on the server — asking, answering, a
 * seller inbox and admin moderation — with no way to reach any of it from the
 * shop. This is the missing front door.
 *
 * Only published questions come back from the API, so a newly asked one is
 * invisible until a moderator releases it. Saying so is the difference between
 * "my question vanished" and "my question is queued".
 */
export function ProductQuestions({ productId }) {
  const { user } = useAuth()
  const load = useCallback(() => qaApi.list(productId), [productId])
  const { data, status, error, reload } = useApiQuery(load, null)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [askError, setAskError] = useState(null)

  // Asking is customer-only on the API, so the form only appears for a shopper
  // rather than offering an action the server will refuse.
  const canAsk = user?.role === 'customer'

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!text.trim()) {
      setAskError('Write your question first.')
      return
    }
    setBusy(true)
    setAskError(null)
    try {
      await qaApi.ask(productId, text.trim())
      setText('')
      setSubmitted(true)
    } catch (requestError) {
      setAskError(
        requestError.response?.data?.error?.message ??
          'Could not post your question. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading questions" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const questions = data?.items ?? []

  return (
    <section className="qa-section">
      <h3>Questions &amp; answers</h3>

      {questions.length ? (
        <ul className="qa-list">
          {questions.map((question) => (
            <li key={question._id} className="qa-item">
              <p className="qa-question">
                <span className="qa-marker" aria-hidden="true">
                  Q
                </span>
                {question.text}
              </p>
              {question.answers?.length ? (
                question.answers.map((entry) => (
                  <p key={entry._id} className="qa-answer">
                    <span className="qa-marker is-answer" aria-hidden="true">
                      A
                    </span>
                    {entry.text}
                  </p>
                ))
              ) : (
                <p className="qa-pending">No answer from the seller yet.</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="qa-empty">No questions yet — be the first to ask.</p>
      )}

      {canAsk &&
        (submitted ? (
          <p className="qa-thanks">Thanks — your question is awaiting moderation.</p>
        ) : (
          <form className="qa-form" onSubmit={submit}>
            <label>
              <span className="sr-only">Ask a question about this product</span>
              <textarea
                rows={2}
                value={text}
                maxLength={2000}
                placeholder="Ask about size, materials, delivery…"
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            {askError && <p className="qa-error">{askError}</p>}
            <button type="submit" className="add-to-cart" disabled={busy}>
              {busy ? 'Posting…' : 'Ask a question'}
            </button>
          </form>
        ))}
    </section>
  )
}
