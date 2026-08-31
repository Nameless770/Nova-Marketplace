// Money reaches the model already formatted so it never performs arithmetic on
// minor units, and never needs to emit a figure of its own.
export function formatMinor(amountMinor, currency = 'USD') {
  if (!Number.isSafeInteger(amountMinor)) return 'price unavailable'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountMinor / 100)
}
