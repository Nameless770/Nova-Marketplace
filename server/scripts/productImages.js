import { createRequire } from 'node:module'
import { CATEGORY_TERMS, poolKeyFor } from './productImageTerms.js'

/**
 * Picks each product's photo from the pool built by fetch-product-images.js.
 *
 * The pool is keyed by what the product *is* — "chef knife", "kettle" — rather
 * than by its category. The old category-keyed version held 28 photos for 320
 * products: one photo landed on seventeen of them, a row of six kitchen items
 * could only show three pictures, and a knife could be illustrated by a bowl.
 *
 * Assignment is by position, not by hash. Hashing spreads products across a pool
 * but collides, so two products of the same kind could still land on the same
 * photo while another went unused. Sorting a kind's products and walking the
 * pool in step guarantees no repeat until the pool is exhausted.
 */
const require = createRequire(import.meta.url)

let pool = {}
try {
  pool = require('./productImagePool.json')
} catch {
  // No pool yet — fetch-product-images.js has not been run. Callers fall back
  // to the generated artwork in the client, which is why this is not fatal.
}

export const hasPool = Object.keys(pool).some((key) => key !== '__provider')

function photosFor(title, categorySlug) {
  const key = poolKeyFor(title, categorySlug)
  const direct = pool[key]
  if (direct?.length) return direct
  // A title naming nothing we search for falls back to its category's photos.
  for (const [needle, urls] of Object.entries(pool)) {
    if (needle === `category:${categorySlug}` && urls?.length) return urls
  }
  return []
}

/**
 * Assigns every product a photo, spreading each kind across its pool.
 *
 * @param products  [{ _id, title, categorySlug }]
 * @returns Map of product id -> image url (absent when the pool has nothing)
 */
export function assignImages(products) {
  const groups = new Map()
  for (const product of products) {
    const key = poolKeyFor(product.title, product.categorySlug)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(product)
  }

  const assigned = new Map()
  for (const [, members] of groups) {
    // Stable order, so re-running produces the same assignment and a product
    // keeps its photo across re-seeds.
    members.sort((a, b) => String(a._id).localeCompare(String(b._id)))
    const urls = photosFor(members[0].title, members[0].categorySlug)
    if (!urls.length) continue
    members.forEach((product, index) => {
      assigned.set(String(product._id), urls[index % urls.length])
    })
  }
  return assigned
}

/** Single-product lookup, for seeding one row at a time. */
export function imageForProduct(title, categorySlug, key = '') {
  const urls = photosFor(title, categorySlug)
  if (!urls.length) return ''
  let value = 0
  const text = String(key)
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) | 0
  }
  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b)
  value ^= value >>> 16
  return urls[Math.abs(value) % urls.length]
}

/** Category-only lookup, kept for callers that do not know the product title. */
export function imageForCategory(categorySlug, key = '') {
  return imageForProduct(CATEGORY_TERMS[categorySlug] ?? '', categorySlug, key)
}
