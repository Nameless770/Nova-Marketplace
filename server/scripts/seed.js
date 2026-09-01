/**
 * Seeds a usable catalogue into whatever MONGODB_URI points at.
 *
 * Idempotent: every write is keyed on a natural identifier, so running it twice
 * updates rather than duplicates. It never deletes anything — pass --fresh to
 * clear the seeded collections first, which is the only destructive path and
 * has to be asked for explicitly.
 *
 *   npm run seed --prefix server
 *   npm run seed --prefix server -- --fresh
 */
import bcrypt from 'bcrypt'
import mongoose from 'mongoose'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(here, '..', '.env') })

const { connectDatabase, disconnectDatabase } = await import('../config/database.js')
const { imageForCategory } = await import('./productImages.js')
const { Category } = await import('../models/Category.js')
const { Inventory } = await import('../models/Inventory.js')
const { Product } = await import('../models/Product.js')
const { ProductVariant } = await import('../models/ProductVariant.js')
const { Seller } = await import('../models/Seller.js')
const { User } = await import('../models/User.js')
const { Coupon } = await import('../models/Coupon.js')

const FRESH = process.argv.includes('--fresh')
const PASSWORD = process.env.SEED_PASSWORD || 'Password123!'

const CATEGORIES = [
  { name: 'Audio', slug: 'audio', sortOrder: 0 },
  { name: 'Lighting', slug: 'lighting', sortOrder: 1 },
  { name: 'Workspace', slug: 'workspace', sortOrder: 2 },
  { name: 'Home', slug: 'home', sortOrder: 3 },
]

const SELLERS = [
  { email: 'seller@example.com', storeName: 'Nova Supply Co', slug: 'nova-supply-co', first: 'Nadia' },
  { email: 'atelier@example.com', storeName: 'Atelier Ito', slug: 'atelier-ito', first: 'Kenji' },
]

// Descriptions carry the words shoppers actually search for, so text search and
// the AI extraction have something real to match against.
const CATALOGUE = [
  {
    store: 'nova-supply-co', category: 'audio', brand: 'Nova',
    title: 'Aurora Wireless Headphones', slug: 'aurora-wireless-headphones',
    description: 'Over-ear wireless headphones with 40 hour battery life, active noise cancelling and fast charging. Memory foam earcups for all-day comfort.',
    priceMinor: 24999, quantity: 24, rating: '4.6', ratingCount: 218,
  },
  {
    store: 'nova-supply-co', category: 'audio', brand: 'Nova',
    title: 'Pulse Wireless Earbuds', slug: 'pulse-wireless-earbuds',
    description: 'Compact wireless earbuds with 6 hours per charge and 24 hours from the case. Sweat resistant, good for running.',
    priceMinor: 7900, quantity: 60, rating: '4.2', ratingCount: 94,
  },
  {
    store: 'atelier-ito', category: 'audio', brand: 'Atelier',
    title: 'Studio Reference Headphones', slug: 'studio-reference-headphones',
    description: 'Wired open-back headphones for mixing and mastering. Flat frequency response, replaceable cable. No battery required.',
    priceMinor: 31900, quantity: 6, rating: '4.9', ratingCount: 47,
  },
  {
    store: 'nova-supply-co', category: 'lighting', brand: 'Lumen',
    title: 'Lumen Desk Lamp', slug: 'lumen-desk-lamp',
    description: 'Warm dimmable desk lamp with three brightness levels and a weighted brass base. Low glare for long working sessions.',
    priceMinor: 8900, quantity: 2, rating: '4.1', ratingCount: 31,
  },
  {
    store: 'atelier-ito', category: 'lighting', brand: 'Atelier',
    title: 'Paper Floor Lamp', slug: 'paper-floor-lamp',
    description: 'Hand-folded paper shade on an ash frame. Diffuse, even light for a living room corner.',
    priceMinor: 15900, quantity: 11, rating: '4.7', ratingCount: 22,
  },
  {
    store: 'nova-supply-co', category: 'workspace', brand: 'Nova',
    title: 'Drift Mechanical Keyboard', slug: 'drift-mechanical-keyboard',
    description: 'Compact 65 percent mechanical keyboard with hot swappable switches and PBT keycaps. USB-C, no software required.',
    priceMinor: 15750, quantity: 0, rating: '4.4', ratingCount: 76,
  },
  {
    store: 'nova-supply-co', category: 'workspace', brand: 'Nova',
    title: 'Grid Laptop Stand', slug: 'grid-laptop-stand',
    description: 'Aluminium laptop stand that raises the screen to eye level. Folds flat for travel, holds up to 16 inch machines.',
    priceMinor: 5400, quantity: 40, rating: '4.5', ratingCount: 143,
  },
  {
    store: 'atelier-ito', category: 'home', brand: 'Atelier',
    title: 'Stoneware Mug Set', slug: 'stoneware-mug-set',
    description: 'Set of four hand-thrown stoneware mugs in a matte glaze. Dishwasher and microwave safe.',
    priceMinor: 4800, quantity: 18, rating: '4.8', ratingCount: 65,
  },
  {
    store: 'atelier-ito', category: 'home', brand: 'Atelier',
    title: 'Linen Throw Blanket', slug: 'linen-throw-blanket',
    description: 'Stonewashed linen throw that softens with every wash. Generous size for a two seater sofa.',
    priceMinor: 11900, quantity: 9, rating: '4.3', ratingCount: 38,
  },
  {
    store: 'nova-supply-co', category: 'workspace', brand: 'Nova',
    title: 'Field Notebook Trio', slug: 'field-notebook-trio',
    description: 'Three pocket notebooks with dot grid pages and a sewn binding that lies flat.',
    priceMinor: 1800, quantity: 120, rating: '4.6', ratingCount: 201,
  },
]

function image(title, categorySlug) {
  // Real category-appropriate product photo (see productImages.js), keyed by the
  // title so a product always maps to the same image across re-seeds.
  return { url: imageForCategory(categorySlug, title), alt: title }
}

async function upsertUser({ email, first, last, role, sellerApprovalStatus }) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await User.findOneAndUpdate(
    { email },
    {
      $set: { firstName: first, lastName: last, role, status: 'active', sellerApprovalStatus },
      $setOnInsert: { passwordHash },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  return user
}

async function run() {
  await connectDatabase()

  if (FRESH) {
    console.log('--fresh: clearing seeded collections')
    await Promise.all(
      [Category, Product, ProductVariant, Inventory, Seller, Coupon].map((M) => M.deleteMany({})),
    )
    await User.deleteMany({ email: { $regex: '@example\\.com$' } })
  }

  const categories = new Map()
  for (const c of CATEGORIES) {
    const doc = await Category.findOneAndUpdate(
      { slug: c.slug },
      { $set: { name: c.name, sortOrder: c.sortOrder, status: 'active', parentId: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    categories.set(c.slug, doc)
  }
  console.log(`categories: ${categories.size}`)

  const sellers = new Map()
  for (const s of SELLERS) {
    const owner = await upsertUser({
      email: s.email,
      first: s.first,
      last: 'Seller',
      role: 'seller',
      sellerApprovalStatus: 'approved',
    })
    const seller = await Seller.findOneAndUpdate(
      { slug: s.slug },
      {
        $set: {
          ownerUserId: owner._id,
          storeName: s.storeName,
          status: 'approved',
          approvedAt: new Date(),
          description: `${s.storeName} makes considered goods in small runs.`,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    await User.updateOne({ _id: owner._id }, { $set: { sellerId: seller._id } })
    sellers.set(s.slug, seller)
  }
  console.log(`sellers: ${sellers.size}`)

  let productCount = 0
  for (const entry of CATALOGUE) {
    const seller = sellers.get(entry.store)
    const category = categories.get(entry.category)

    const product = await Product.findOneAndUpdate(
      { slug: entry.slug, sellerId: seller._id },
      {
        $set: {
          title: entry.title,
          description: entry.description,
          brand: entry.brand,
          categoryIds: [category._id],
          images: [image(entry.title, entry.category)],
          hasVariants: true,
          status: 'active',
          ratingAverage: mongoose.Types.Decimal128.fromString(entry.rating),
          ratingCount: entry.ratingCount,
          currency: 'USD',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    const variant = await ProductVariant.findOneAndUpdate(
      { sku: `SKU-${entry.slug.toUpperCase()}` },
      {
        $set: {
          productId: product._id,
          sellerId: seller._id,
          name: 'Standard',
          priceMinor: entry.priceMinor,
          currentPriceMinor: entry.priceMinor,
          status: 'active',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    // Search filters and sorts on Product.currentPriceMinor; without it every
    // price-range query silently excludes the product.
    await Product.updateOne(
      { _id: product._id },
      {
        $set: {
          minPriceMinor: variant.currentPriceMinor,
          maxPriceMinor: variant.currentPriceMinor,
          currentPriceMinor: variant.currentPriceMinor,
          priceMinor: variant.currentPriceMinor,
        },
      },
    )

    await Inventory.findOneAndUpdate(
      { variantId: variant._id },
      {
        $set: {
          sellerId: seller._id,
          productId: product._id,
          sku: variant.sku,
          quantityOnHand: entry.quantity,
          quantityReserved: 0,
          quantityAvailable: entry.quantity,
          lowStockThreshold: 5,
          isLowStock: entry.quantity <= 5,
          status: entry.quantity > 0 ? 'active' : 'out_of_stock',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    productCount += 1
  }
  console.log(`products: ${productCount}`)

  const admin = await upsertUser({
    email: 'admin@example.com',
    first: 'Ada',
    last: 'Admin',
    role: 'admin',
    sellerApprovalStatus: 'not_applicable',
  })
  await upsertUser({
    email: 'buyer@example.com',
    first: 'Bo',
    last: 'Buyer',
    role: 'customer',
    sellerApprovalStatus: 'not_applicable',
  })

  await Coupon.findOneAndUpdate(
    { code: 'WELCOME10' },
    {
      $set: {
        ownerType: 'platform',
        discountType: 'fixed',
        discountValue: 1000,
        currency: 'USD',
        startsAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        perUserUsageLimit: 1,
        status: 'active',
        createdBy: admin._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  console.log('\nAccounts (password: %s)', PASSWORD)
  console.log('  admin@example.com     admin')
  console.log('  seller@example.com    seller — Nova Supply Co')
  console.log('  atelier@example.com   seller — Atelier Ito')
  console.log('  buyer@example.com     customer')
  console.log('\nCoupon: WELCOME10 ($10 off)')

  await disconnectDatabase()
}

run().catch(async (error) => {
  console.error('Seed failed:', error.message)
  await disconnectDatabase().catch(() => {})
  process.exitCode = 1
})
