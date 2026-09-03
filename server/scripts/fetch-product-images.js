/**
 * Builds the product photo pool from a stock photo library.
 *
 * Run once (or whenever the catalogue's vocabulary changes):
 *   node scripts/fetch-product-images.js
 *
 * Why this exists: the catalogue has 320 products and the original pool held 28
 * photos keyed by *category*, so one picture appeared on seventeen products and
 * a chef's knife could be illustrated by a mixing bowl. Fixing that needs
 * hundreds of photos chosen by what each product actually is.
 *
 * The key is read from the environment and used only here. The output is a JSON
 * file of image URLs which is committed and seeded into the database, so the
 * running application never calls a stock API and never needs the key — it just
 * loads images from the provider's CDN.
 *
 * Set ONE of these in server/.env:
 *   PEXELS_API_KEY=...        https://www.pexels.com/api/  (instant, 200 req/hr)
 *   UNSPLASH_ACCESS_KEY=...   https://unsplash.com/developers  (demo, 50 req/hr)
 *
 * Keyless sources were tried first and rejected on evidence: Unsplash's search
 * endpoint requires authorisation, its old keyless `source` host now returns
 * 503, loremflickr returned an AI illustration for "headphones" and a photo of
 * food for "kettlebell", and Wikimedia Commons — while correctly licensed and
 * good for common items — is an encyclopedic archive, so "reading light" found
 * paintings of women reading and "monitor arm" found broken CRTs.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEARCH_TERMS } from './productImageTerms.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'productImagePool.json')
const PER_TERM = 15
const GAP_MS = 400

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const PEXELS_KEY = process.env.PEXELS_API_KEY
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY

if (!PEXELS_KEY && !UNSPLASH_KEY) {
  console.error(
    'No image API key found.\n' +
      'Add ONE of these to server/.env and run again:\n' +
      '  PEXELS_API_KEY=...       from https://www.pexels.com/api/\n' +
      '  UNSPLASH_ACCESS_KEY=...  from https://unsplash.com/developers',
  )
  process.exit(1)
}

const provider = PEXELS_KEY ? 'pexels' : 'unsplash'

async function search(term, attempt = 1) {
  const url =
    provider === 'pexels'
      ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(term)}&per_page=${PER_TERM}&orientation=square`
      : `https://api.unsplash.com/search/photos?query=${encodeURIComponent(term)}&per_page=${PER_TERM}&orientation=squarish`

  const headers =
    provider === 'pexels'
      ? { Authorization: PEXELS_KEY }
      : { Authorization: `Client-ID ${UNSPLASH_KEY}` }

  const response = await fetch(url, { headers })
  if (response.status === 429 && attempt <= 4) {
    const wait = 2000 * 2 ** attempt
    console.log(`    rate limited on "${term}", waiting ${wait}ms`)
    await sleep(wait)
    return search(term, attempt + 1)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json()

  // Both providers are asked for a square-ish crop at a card-friendly size, so
  // the grid does not letterbox and the bytes stay small.
  return provider === 'pexels'
    ? (body.photos ?? []).map((photo) => `${photo.src.large}`)
    : (body.results ?? []).map((photo) => `${photo.urls.raw}&w=800&h=800&fit=crop&q=70&auto=format`)
}

// Resume rather than restart, so a rate-limited run does not re-request
// everything it already has.
let pool = {}
try {
  pool = JSON.parse(await fs.readFile(OUT, 'utf8'))
} catch {
  // No pool yet.
}
// A pool built by a different provider must not be half-replaced — resuming
// into it would leave the catalogue split between two image sources. An
// unmarked pool predates this field, so it is foreign too.
const previous = pool.__provider
if (Object.keys(pool).length && previous !== provider) {
  console.log(`previous pool came from ${previous ?? 'an unknown source'}; rebuilding`)
  pool = {}
}

console.log(`fetching from ${provider}\n`)
let total = 0
for (const [key, term] of SEARCH_TERMS) {
  if (pool[key]?.length) {
    total += pool[key].length
    continue
  }
  try {
    const urls = await search(term)
    pool[key] = urls
    total += urls.length
    console.log(`${String(urls.length).padStart(2)}  ${key}  (${term})`)
  } catch (error) {
    pool[key] = []
    console.log(` !  ${key}  ${error.message}`)
  }
  await sleep(GAP_MS)
}
pool.__provider = provider

await fs.writeFile(OUT, `${JSON.stringify(pool, null, 2)}\n`)
console.log(`\n${total} photos across ${SEARCH_TERMS.length} terms -> ${OUT}`)
const empty = SEARCH_TERMS.filter(([key]) => !pool[key]?.length)
if (empty.length) console.log('EMPTY:', empty.map(([key]) => key).join(', '))
