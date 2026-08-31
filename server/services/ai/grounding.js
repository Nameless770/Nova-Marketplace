// The enforcement layer for the never-invent rule.
//
// The model selects; the database renders. Nothing the model writes about a
// product's price, rating or stock is ever trusted or forwarded — those values
// are taken from the candidate records that came out of MongoDB in this turn.

// Currency-shaped claims the model should never have produced. Bare numbers are
// left alone ("30 hours of battery" is legitimate description); only amounts
// attached to a currency marker are stripped.
const CURRENCY_CLAIM =
  /(?:[$£€¥]\s?\d[\d,]*(?:\.\d+)?)|(?:\d[\d,]*(?:\.\d+)?\s?(?:USD|GBP|EUR|dollars?|pounds?|euros?))/gi

// A star/rating claim, e.g. "4.5 stars", "rated 5/5".
const RATING_CLAIM = /\b\d(?:\.\d+)?\s*(?:\/\s*5|stars?|out of 5)\b/gi

export function sanitizeModelProse(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(CURRENCY_CLAIM, '[price]')
    .replace(RATING_CLAIM, '[rating]')
    .trim()
    .slice(0, 600)
}

/**
 * Drops any recommendation whose product was not returned by this turn's search.
 *
 * The candidate set is per turn, never per conversation: a product mentioned
 * earlier must be re-retrieved to be mentioned again, because its price and
 * stock may since have changed.
 */
export function validateRecommendations(modelOutput, candidatesById) {
  const accepted = []
  const rejected = []
  const seen = new Set()

  const raw = Array.isArray(modelOutput?.recommendations) ? modelOutput.recommendations : []

  for (const entry of raw) {
    const productId = typeof entry?.productId === 'string' ? entry.productId.trim() : ''
    if (!productId || !candidatesById.has(productId)) {
      rejected.push({ productId: productId || '(missing)', cause: 'not_in_candidate_set' })
      continue
    }
    if (seen.has(productId)) {
      rejected.push({ productId, cause: 'duplicate' })
      continue
    }
    seen.add(productId)
    accepted.push({ productId, reason: sanitizeModelProse(entry.reason) })
  }

  return { accepted, rejected }
}

/**
 * Builds the response payload from authoritative database records, attaching
 * only the model's short reason. Every displayed figure originates here, so a
 * hallucinated price has nowhere to go.
 */
export function rehydrate(accepted, candidatesById) {
  return accepted.slice(0, 4).map(({ productId, reason }) => {
    const product = candidatesById.get(productId)
    return {
      productId: product.id,
      title: product.title,
      brand: product.brand,
      priceMinor: product.priceMinor,
      currency: product.currency,
      ratingAverage: product.ratingAverage,
      ratingCount: product.ratingCount,
      inStock: product.inStock,
      imageUrl: product.imageUrl,
      reason,
    }
  })
}
