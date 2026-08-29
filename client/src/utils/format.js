export function formatMoney(amountMinor, currency = 'USD') {
  if (!Number.isSafeInteger(amountMinor)) return 'Price unavailable'

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amountMinor / 100)
}

export function variantLabel(variant) {
  if (!variant) return ''

  return [variant.name, variant.size, variant.color].filter(Boolean).join(' · ')
}
