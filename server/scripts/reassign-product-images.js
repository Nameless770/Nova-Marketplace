/**
 * Repoints every existing product's image at a real, category-appropriate photo
 * (see productImages.js). Use it to fix a catalogue that was seeded with the old
 * picsum.photos URLs without a full re-seed.
 *
 *   node scripts/reassign-product-images.js --prefix server
 *   npm run reassign:images --prefix server   (if wired as an npm script)
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(here, '..', '.env') })

const { connectDatabase, disconnectDatabase } = await import('../config/database.js')
const { imageForCategory } = await import('./productImages.js')
const { Category } = await import('../models/Category.js')
const { Product } = await import('../models/Product.js')

await connectDatabase()

const catSlugById = new Map(
  (await Category.find({}, { slug: 1 }).lean()).map((c) => [String(c._id), c.slug]),
)

const products = await Product.find({}, { slug: 1, title: 1, categoryIds: 1 }).lean()
const ops = products.map((p) => {
  const slug = catSlugById.get(String(p.categoryIds?.[0]))
  return {
    updateOne: {
      filter: { _id: p._id },
      update: { $set: { 'images.0.url': imageForCategory(slug, p.slug || p.title || ''), 'images.0.alt': p.title } },
    },
  }
})

if (ops.length) await Product.bulkWrite(ops, { ordered: false })
console.log(`updated images on ${ops.length} product(s)`)

await disconnectDatabase()
