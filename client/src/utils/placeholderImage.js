// Seeded product images point at picsum.photos, an external host that is slow
// or blocked in a lot of environments. Rather than show a broken box, every
// product falls back to a generated monogram tile: an inline SVG data URI, so
// it needs no network and passes any CSP. Colours come from the design tokens
// so the placeholders read as part of the marketplace, not as errors.
const PALETTES = [
  { bg: '#efe9de', fg: '#cc785c' }, // card + coral
  { bg: '#cc785c', fg: '#faf9f5' }, // coral + cream
  { bg: '#181715', fg: '#efe9de' }, // dark surface + card
  { bg: '#d9cfc0', fg: '#141413' }, // warm sand + ink
  { bg: '#e6dfd8', fg: '#8a5a44' }, // hairline + muted coral
]

function hash(text) {
  let value = 0
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) | 0
  }
  return Math.abs(value)
}

// Up to two initials: first letter of the first two words, or the first two
// letters of a single word. Falls back to a neutral mark for empty input.
function initials(label) {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function placeholderImage(label = 'Product') {
  const text = String(label)
  const { bg, fg } = PALETTES[hash(text) % PALETTES.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="${bg}"/>
  <text x="200" y="212" fill="${fg}" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="176" letter-spacing="2">${initials(text)}</text>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
