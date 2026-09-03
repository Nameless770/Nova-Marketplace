/**
 * Repoints every existing product at a photo of the thing it actually is, using
 * the pool built by fetch-product-images.js. Fixes a catalogue in place, without
 * a full re-seed.
 *
 *   node scripts/fetch-product-images.js      # once, needs an API key
 *   node scripts/reassign-product-images.js   # then this, any time
 *
 * Reports how many distinct photos the catalogue ends up with, because the whole
 * point of the exercise is that 320 products stop sharing 28 pictures.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(here, '..', '.env') })

const { connectDatabase, disconnectDatabase } = await import('../config/database.js')
const { assignImages, hasPool } = await import('./productImages.js')
const { Category } = await import('../models/Category.js')
const { Product } = await import('../models/Product.js')

if (!hasPool) {
  console.error(
    'No photo pool found. Run `node scripts/fetch-product-images.js` first —\n' +
      'it needs PEXELS_API_KEY or UNSPLASH_ACCESS_KEY in server/.env.',
  )
  process.exit(1)
}

await connectDatabase()

const catSlugById = new Map(
  (await Category.find({}, { slug: 1 }).lean()).map((c) => [String(c._id), c.slug]),
)

const products = (await Product.find({}, { slug: 1, title: 1, categoryIds: 1 }).lean()).map(
  (p) => ({
    ...p,
    categorySlug: catSlugById.get(String(p.categoryIds?.[0])) ?? '',
  }),
)

const assigned = assignImages(products)

const ops = []
for (const product of products) {
  const url = assigned.get(String(product._id))
  if (!url) continue
  ops.push({
    updateOne: {
      filter: { _id: product._id },
      update: { $set: { 'images.0.url': url, 'images.0.alt': product.title } },
    },
  })
}

if (ops.length) await Product.bulkWrite(ops, { ordered: false })

const distinct = new Set(assigned.values()).size
const missing = products.length - assigned.size
console.log(`updated ${ops.length} of ${products.length} products`)
console.log(`distinct photos in use: ${distinct}`)
if (missing) console.log(`no photo available for ${missing} product(s)`)

// Worth seeing: a term with more products than photos is where repeats remain.
const counts = new Map()
for (const url of assigned.values()) counts.set(url, (counts.get(url) ?? 0) + 1)
const worst = [...counts.values()].sort((a, b) => b - a)[0] ?? 0
console.log(`most-reused photo appears on ${worst} product(s)`)

await disconnectDatabase()
