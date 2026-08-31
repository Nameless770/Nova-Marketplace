export function formatMoney(amountMinor, currency = 'USD') {
  if (!Number.isSafeInteger(amountMinor)) return 'Price unavailable'

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amountMinor / 100)
}

export function formatRating(rating) {
  const value = Number(rating?.$numberDecimal ?? rating)
  return Number.isFinite(value) ? value.toFixed(1) : '0.0'
}

export function variantLabel(variant) {
  if (!variant) return ''

  return [variant.name, variant.size, variant.color].filter(Boolean).join(' · ')
}
