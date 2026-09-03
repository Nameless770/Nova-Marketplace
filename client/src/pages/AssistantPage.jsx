import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { ProductImage } from '../components/ProductImage.jsx'
import { useCart } from '../context/useCart.js'
import { aiApi, catalogApi } from '../services/api.js'
import { formatMoney, formatRating } from '../utils/format.js'

// Concrete openers do more than an empty box: they show the kind of question
// the assistant is actually good at.
const EXAMPLES = [
  'A warm reading light for a small bedroom, under $200',
  'Something for a friend who just moved into a new flat',
  'A hard-wearing bag I can cycle with',
  'Desk accessories to tidy a home office',
]

function Recommendation({ item }) {
  const { addToCart } = useCart()
  const [state, setState] = useState('idle') // idle | busy | added | error

  async function add() {
    if (state === 'busy') return
    setState('busy')
    try {
      // The assistant returns products, not variants, so resolve a default one.
      const response = await catalogApi.getProduct(item.productId)
      const variants = response.data.data.product?.variants ?? []
      const variantId = (variants.find((v) => v.status === 'active') ?? variants[0])?._id
      if (!variantId) throw new Error('unavailable')
      await addToCart({ productId: item.productId, variantId, quantity: 1 })
      setState('added')
      setTimeout(() => setState('idle'), 1800)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 1800)
    }
  }

  return (
    <article className="assistant-card">
      <Link to={`/products/${item.productId}`} className="assistant-card-image">
        <ProductImage
          url={item.imageUrl}
          alt={item.title}
          label={item.title}
          seed={item.productId}
        />
      </Link>
      <div className="assistant-card-body">
        <span className="product-brand">{item.brand || 'Independent label'}</span>
        <Link to={`/products/${item.productId}`}>
          <h3>{item.title}</h3>
        </Link>
        {/* The model's own words for why this one — the rest is from the DB. */}
        <p className="assistant-reason">{item.reason}</p>
        <div className="product-meta">
          <strong>{formatMoney(item.priceMinor, item.currency)}</strong>
          <span>
            {formatRating(item.ratingAverage)} / 5{item.ratingCount ? ` · ${item.ratingCount}` : ''}
          </span>
        </div>
        {!item.inStock && <p className="assistant-oos">Out of stock</p>}
        <button
          type="button"
          className="add-to-cart"
          onClick={add}
          disabled={state === 'busy' || !item.inStock}
        >
          {{ idle: 'Add to cart', busy: 'Adding…', added: 'Added ✓', error: 'Try again' }[state]}
        </button>
      </div>
    </article>
  )
}

export function AssistantPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [asked, setAsked] = useState('')
  const inputRef = useRef(null)

  async function ask(text) {
    const value = (text ?? query).trim()
    if (!value || status === 'loading') return
    setStatus('loading')
    setError(null)
    setAsked(value)
    try {
      const response = await aiApi.shoppingAssistant(value)
      setResult(response.data.data)
      setStatus('done')
    } catch (requestError) {
      setError(requestError.message)
      setStatus('error')
    }
  }

  // Not named use* — that prefix makes lint treat a plain helper as a hook.
  function askExample(example) {
    setQuery(example)
    inputRef.current?.focus()
    ask(example)
  }

  return (
    <section className="assistant">
      <p className="eyebrow">Shopping assistant</p>
      <h2>Describe what you are looking for.</h2>
      <p className="assistant-intro">
        Ask in your own words. Every product below is pulled from our catalogue — prices and stock
        are read live, never written by the assistant.
      </p>

      <form
        className="assistant-form"
        onSubmit={(event) => {
          event.preventDefault()
          ask()
        }}
      >
        <input
          ref={inputRef}
          aria-label="What are you looking for?"
          placeholder="A warm reading light for a small bedroom, under $200"
          value={query}
          maxLength={500}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="primary-action" disabled={status === 'loading' || !query.trim()}>
          {status === 'loading' ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {status === 'idle' && (
        <div className="assistant-examples">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="example-chip"
              onClick={() => askExample(example)}
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {status === 'loading' && (
        <p className="assistant-thinking" role="status">
          Reading the catalogue for “{asked}”…
        </p>
      )}

      {status === 'error' && <ErrorState message={error} onRetry={() => ask(asked)} />}

      {status === 'done' && result && (
        <div className="assistant-result">
          <p className="assistant-message">{result.message}</p>
          {result.recommendations?.length > 0 && (
            <div className="assistant-grid">
              {result.recommendations.map((item) => (
                <Recommendation key={item.productId} item={item} />
              ))}
            </div>
          )}
          {result.noMatch && (
            <Link className="secondary-action" to="/products">
              Browse everything instead
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
