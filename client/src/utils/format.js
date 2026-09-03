export function formatMoney(amountMinor, currency = 'USD') {
  if (!Number.isSafeInteger(amountMinor)) return 'Price unavailable'

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amountMinor / 100)
}

/**
 * A typed price, in the integer minor units the API filters on.
 *
 * Money is minor units everywhere behind the API, but a shopper types "25", not
 * "2500". Rounding matters: `25.999 * 100` is 2599.9, and a fractional value in
 * a `$gte` silently matches nothing rather than erroring.
 */
export function toMinorUnits(value) {
  const amount = Number(String(value).trim())
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100)
}

/** The inverse, for putting a URL's minor-unit value back into an input. */
export function fromMinorUnits(amountMinor) {
  const amount = Number(amountMinor)
  if (!Number.isFinite(amount)) return ''
  return String(amount / 100)
}

export function formatRating(rating) {
  const value = Number(rating?.$numberDecimal ?? rating)
  return Number.isFinite(value) ? value.toFixed(1) : '0.0'
}

export function variantLabel(variant) {
  if (!variant) return ''

  return [variant.name, variant.size, variant.color].filter(Boolean).join(' · ')
}
