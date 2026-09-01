import mongoose from 'mongoose'
import { Cart } from '../models/Cart.js'
import { Category } from '../models/Category.js'
import { Inventory } from '../models/Inventory.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Product } from '../models/Product.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { RecentlyViewed } from '../models/RecentlyViewed.js'
import { Wishlist } from '../models/Wishlist.js'
import { AppError } from '../utils/errors.js'

/**
 * A deliberately simple, fully explainable recommender.
 *
 * There is no model and no training. Every recommendation is the sum of a few
 * named rules, and every rule that fires becomes a sentence the shopper can
 * read. That means a surprising recommendation can always be explained by
 * pointing at the rule that caused it — which is not true of a learned ranker,
 * and is the main reason to start here.
 */

// How much each signal says about taste. Purchases are strongest because money
// changed hands; views are weakest because they include idle browsing.
const SIGNAL_WEIGHTS = { purchase: 5, wishlist: 3, view: 2 }

// How much each matching rule contributes to a candidate's score.
const SCORE = {
  category: 40,
  brand: 25,
  priceFit: 15,
  rating: 10,
  inStock: 5,
  similarCategory: 45,
  similarBrand: 25,
  similarPrice: 20,
}

const VIEW_HALF_LIFE_DAYS = 14
const MAX_CANDIDATES = 120
const MAX_PER_CATEGORY = 3
const MAX_PER_SELLER = 3

function decimalToNumber(value) {
  const parsed = Number(value?.$numberDecimal ?? value)
  return Number.isFinite(parsed) ? parsed : 0
}

// A view from a month ago should count for less than one from this morning.
function recencyMultiplier(lastViewedAt) {
  const ageDays = (Date.now() - new Date(lastViewedAt).getTime()) / (24 * 60 * 60 * 1000)
  return Math.pow(0.5, Math.max(ageDays, 0) / VIEW_HALF_LIFE_DAYS)
}

function addWeight(map, key, weight) {
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + weight)
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function topKeys(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key)
}

/**
 * Builds a taste profile from the shopper's own activity.
 *
 * Returns the categories and brands they engage with, the price band they
 * actually shop in, and the products to exclude because they already have them.
 */
export async function buildTasteProfile(userId) {
  const [purchasedItems, wishlist, viewed, cart] = await Promise.all([
    // Only paid orders count as a purchase signal.
    OrderItem.aggregate([
      {
        $lookup: {
          from: Order.collection.name,
          localField: 'orderId',
          foreignField: '_id',
          as: 'order',
        },
      },
      { $unwind: '$order' },
      {
        $match: {
          'order.customerId': new mongoose.Types.ObjectId(userId),
          'order.paymentStatus': { $in: ['paid', 'partially_refunded'] },
        },
      },
      { $group: { _id: '$productId', unitPrice: { $first: '$unitPriceMinor' } } },
      { $limit: 200 },
    ]),
    Wishlist.findOne({ userId }).lean(),
    RecentlyViewed.find({ userId }).sort({ lastViewedAt: -1 }).limit(50).lean(),
    Cart.findOne({ userId }).lean(),
  ])

  const categoryWeights = new Map()
  const brandWeights = new Map()
  const prices = []
  const exclude = new Set()

  const purchasedIds = purchasedItems.map((item) => item._id)
  const wishlistIds = (wishlist?.items ?? []).map((item) => item.productId)
  const engagedIds = [...purchasedIds, ...wishlistIds]

  // Purchases and wishlist entries only carry product ids, so their category,
  // brand and price come from the products themselves.
  const engagedProducts = engagedIds.length
    ? await Product.find({ _id: { $in: engagedIds } })
        .select('categoryIds brand currentPriceMinor minPriceMinor')
        .lean()
    : []
  const engagedById = new Map(engagedProducts.map((product) => [product._id.toString(), product]))

  const applyProduct = (product, weight) => {
    if (!product) return
    for (const categoryId of product.categoryIds ?? [])
      addWeight(categoryWeights, categoryId.toString(), weight)
    addWeight(brandWeights, product.brand, weight)
    const price = product.currentPriceMinor ?? product.minPriceMinor
    if (Number.isSafeInteger(price)) prices.push(price)
  }

  for (const id of purchasedIds) {
    exclude.add(id.toString())
    applyProduct(engagedById.get(id.toString()), SIGNAL_WEIGHTS.purchase)
  }
  for (const id of wishlistIds) {
    exclude.add(id.toString())
    applyProduct(engagedById.get(id.toString()), SIGNAL_WEIGHTS.wishlist)
  }
  for (const item of cart?.items ?? []) exclude.add(item.productId.toString())

  // Views already carry a denormalised snapshot, so they need no extra lookup.
  for (const view of viewed) {
    const weight = SIGNAL_WEIGHTS.view * recencyMultiplier(view.lastViewedAt)
    for (const categoryId of view.categoryIds ?? [])
      addWeight(categoryWeights, categoryId.toString(), weight)
    addWeight(brandWeights, view.brand, weight)
    if (Number.isSafeInteger(view.priceMinor)) prices.push(view.priceMinor)
  }

  const medianPrice = median(prices)
  const priceBand = medianPrice
    ? { minMinor: Math.round(medianPrice * 0.5), maxMinor: Math.round(medianPrice * 1.75) }
    : null

  return {
    categoryWeights,
    brandWeights,
    priceBand,
    exclude,
    signalCounts: {
      purchases: purchasedIds.length,
      wishlist: wishlistIds.length,
      views: viewed.length,
    },
    hasSignals: categoryWeights.size > 0 || brandWeights.size > 0,
  }
}

async function inStockProductIds(productIds) {
  const variants = await ProductVariant.find({
    productId: { $in: productIds },
    status: 'active',
  })
    .select('_id productId')
    .lean()
  const inventories = await Inventory.find({
    variantId: { $in: variants.map((variant) => variant._id) },
  })
    .select('variantId quantityAvailable')
    .lean()

  const availableByVariant = new Map(
    inventories.map((row) => [row.variantId.toString(), row.quantityAvailable]),
  )
  const inStock = new Set()
  for (const variant of variants) {
    if ((availableByVariant.get(variant._id.toString()) ?? 0) > 0)
      inStock.add(variant.productId.toString())
  }
  return inStock
}

function presentable(product, score, reasons, inStock) {
  return {
    productId: product._id.toString(),
    title: product.title,
    brand: product.brand ?? null,
    priceMinor: product.currentPriceMinor ?? product.minPriceMinor ?? 0,
    currency: product.currency ?? 'USD',
    ratingAverage: decimalToNumber(product.ratingAverage),
    ratingCount: product.ratingCount ?? 0,
    imageUrl: product.images?.[0]?.url ?? null,
    inStock,
    score: Math.round(score),
    reasons,
  }
}

// Keeps one category or one seller from filling the whole shelf.
function diversify(scored, limit) {
  const perCategory = new Map()
  const perSeller = new Map()
  const chosen = []

  for (const entry of scored) {
    const categoryKey = entry.primaryCategory ?? 'none'
    const sellerKey = entry.sellerId ?? 'none'
    if ((perCategory.get(categoryKey) ?? 0) >= MAX_PER_CATEGORY) continue
    if ((perSeller.get(sellerKey) ?? 0) >= MAX_PER_SELLER) continue
    perCategory.set(categoryKey, (perCategory.get(categoryKey) ?? 0) + 1)
    perSeller.set(sellerKey, (perSeller.get(sellerKey) ?? 0) + 1)
    chosen.push(entry)
    if (chosen.length >= limit) break
  }
  return chosen
}

/**
 * Personalised recommendations. Falls back to a popularity shelf for a shopper
 * with no history, which is labelled honestly rather than dressed up as personal.
 */
export async function recommendForUser(userId, { limit = 8 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 24)
  const profile = await buildTasteProfile(userId)

  if (!profile.hasSignals) {
    const popular = await popularProducts(safeLimit, profile.exclude)
    return {
      strategy: 'popular',
      personalised: false,
      signalCounts: profile.signalCounts,
      items: popular,
    }
  }

  const topCategories = topKeys(profile.categoryWeights, 5)
  const topBrands = topKeys(profile.brandWeights, 5)

  const candidates = await Product.find({
    status: 'active',
    _id: { $nin: [...profile.exclude].map((id) => new mongoose.Types.ObjectId(id)) },
    $or: [
      ...(topCategories.length ? [{ categoryIds: { $in: topCategories } }] : []),
      ...(topBrands.length ? [{ brand: { $in: topBrands } }] : []),
    ],
  })
    .select(
      'title brand categoryIds currentPriceMinor minPriceMinor currency ratingAverage ratingCount images sellerId',
    )
    .limit(MAX_CANDIDATES)
    .lean()

  if (candidates.length === 0) {
    const popular = await popularProducts(safeLimit, profile.exclude)
    return {
      strategy: 'popular',
      personalised: false,
      signalCounts: profile.signalCounts,
      items: popular,
    }
  }

  const stock = await inStockProductIds(candidates.map((product) => product._id))
  const categoryNames = await categoryNameMap(topCategories)

  const maxCategoryWeight = Math.max(...profile.categoryWeights.values(), 1)
  const maxBrandWeight = Math.max(...profile.brandWeights.values(), 1)

  const scored = candidates
    .map((product) => {
      const reasons = []
      let score = 0

      // Category affinity — the strongest and most legible signal.
      let bestCategory = null
      let bestCategoryWeight = 0
      for (const categoryId of product.categoryIds ?? []) {
        const weight = profile.categoryWeights.get(categoryId.toString()) ?? 0
        if (weight > bestCategoryWeight) {
          bestCategoryWeight = weight
          bestCategory = categoryId.toString()
        }
      }
      if (bestCategoryWeight > 0) {
        score += SCORE.category * (bestCategoryWeight / maxCategoryWeight)
        reasons.push({
          code: 'category_affinity',
          label: categoryNames.get(bestCategory)
            ? `Because you shop in ${categoryNames.get(bestCategory)}`
            : 'From a category you browse',
        })
      }

      const brandWeight = product.brand ? (profile.brandWeights.get(product.brand) ?? 0) : 0
      if (brandWeight > 0) {
        score += SCORE.brand * (brandWeight / maxBrandWeight)
        reasons.push({ code: 'brand_affinity', label: `More from ${product.brand}` })
      }

      const price = product.currentPriceMinor ?? product.minPriceMinor ?? 0
      if (
        profile.priceBand &&
        price >= profile.priceBand.minMinor &&
        price <= profile.priceBand.maxMinor
      ) {
        score += SCORE.priceFit
        reasons.push({ code: 'price_fit', label: 'In your usual price range' })
      }

      const rating = decimalToNumber(product.ratingAverage)
      if (rating >= 4 && (product.ratingCount ?? 0) > 0) {
        score += SCORE.rating * (rating / 5)
        reasons.push({ code: 'well_rated', label: 'Highly rated by other shoppers' })
      }

      const isInStock = stock.has(product._id.toString())
      if (isInStock) score += SCORE.inStock

      return {
        ...presentable(product, score, reasons, isInStock),
        primaryCategory: bestCategory,
        sellerId: product.sellerId?.toString() ?? null,
      }
    })
    // A recommendation nobody can buy is not a recommendation.
    .filter((entry) => entry.inStock && entry.reasons.length > 0)
    .sort((a, b) => b.score - a.score)

  const items = diversify(scored, safeLimit).map(
    ({ primaryCategory: _category, sellerId: _seller, ...item }) => item,
  )

  return {
    strategy: items.length ? 'personalised' : 'popular',
    personalised: items.length > 0,
    signalCounts: profile.signalCounts,
    items: items.length ? items : await popularProducts(safeLimit, profile.exclude),
  }
}

async function categoryNameMap(categoryIds) {
  if (categoryIds.length === 0) return new Map()
  const categories = await Category.find({ _id: { $in: categoryIds } })
    .select('name')
    .lean()
  return new Map(categories.map((category) => [category._id.toString(), category.name]))
}

async function popularProducts(limit, exclude = new Set()) {
  const products = await Product.find({
    status: 'active',
    _id: { $nin: [...exclude].map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select('title brand currentPriceMinor minPriceMinor currency ratingAverage ratingCount images')
    .sort({ ratingAverage: -1, ratingCount: -1, _id: -1 })
    .limit(limit * 2)
    .lean()

  const stock = await inStockProductIds(products.map((product) => product._id))
  return products
    .filter((product) => stock.has(product._id.toString()))
    .slice(0, limit)
    .map((product) =>
      presentable(product, 0, [{ code: 'popular', label: 'Popular right now' }], true),
    )
}

/**
 * "More like this" for a single product. Content-based similarity over fields
 * the catalogue already has — shared category, same brand, nearby price.
 */
export async function similarProducts(productId, { limit = 6 } = {}) {
  if (!mongoose.isValidObjectId(productId))
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')

  const seed = await Product.findOne({ _id: productId, status: 'active' })
    .select('categoryIds brand currentPriceMinor minPriceMinor')
    .lean()
  if (!seed) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')

  const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 12)
  const seedPrice = seed.currentPriceMinor ?? seed.minPriceMinor ?? 0
  const seedCategories = (seed.categoryIds ?? []).map((id) => id.toString())

  const candidates = await Product.find({
    _id: { $ne: seed._id },
    status: 'active',
    $or: [
      ...(seedCategories.length ? [{ categoryIds: { $in: seed.categoryIds } }] : []),
      ...(seed.brand ? [{ brand: seed.brand }] : []),
    ],
  })
    .select(
      'title brand categoryIds currentPriceMinor minPriceMinor currency ratingAverage ratingCount images sellerId',
    )
    .limit(MAX_CANDIDATES)
    .lean()

  if (candidates.length === 0) return { items: [] }

  const stock = await inStockProductIds(candidates.map((product) => product._id))

  const scored = candidates
    .map((product) => {
      const reasons = []
      let score = 0

      const shared = (product.categoryIds ?? []).filter((id) =>
        seedCategories.includes(id.toString()),
      ).length
      if (shared > 0) {
        score += SCORE.similarCategory
        reasons.push({ code: 'same_category', label: 'In the same category' })
      }
      if (seed.brand && product.brand === seed.brand) {
        score += SCORE.similarBrand
        reasons.push({ code: 'same_brand', label: `Also by ${seed.brand}` })
      }

      const price = product.currentPriceMinor ?? product.minPriceMinor ?? 0
      if (seedPrice > 0) {
        const ratio = Math.abs(price - seedPrice) / seedPrice
        if (ratio <= 0.35) {
          score += SCORE.similarPrice * (1 - ratio / 0.35)
          reasons.push({ code: 'similar_price', label: 'Similarly priced' })
        }
      }

      const rating = decimalToNumber(product.ratingAverage)
      if (rating >= 4 && (product.ratingCount ?? 0) > 0) score += SCORE.rating * (rating / 5)

      const isInStock = stock.has(product._id.toString())
      return {
        ...presentable(product, score, reasons, isInStock),
        primaryCategory: (product.categoryIds ?? [])[0]?.toString() ?? null,
        sellerId: product.sellerId?.toString() ?? null,
      }
    })
    .filter((entry) => entry.inStock && entry.reasons.length > 0)
    .sort((a, b) => b.score - a.score)

  return {
    items: diversify(scored, safeLimit).map(
      ({ primaryCategory: _category, sellerId: _seller, ...item }) => item,
    ),
  }
}

// In-flight view writes. Callers deliberately do not await recordProductView,
// so this lets shutdown (and tests) wait for them to land instead of losing them.
const pendingViewWrites = new Set()

export function flushViewWrites() {
  return Promise.allSettled([...pendingViewWrites])
}

/**
 * Records a product view. Fire-and-forget: a failure here must never break
 * product browsing, so callers do not await the result.
 */
export function recordProductView(userId, product) {
  const write = writeView(userId, product)
  pendingViewWrites.add(write)
  write.finally(() => pendingViewWrites.delete(write))
  return write
}

async function writeView(userId, product) {
  if (!userId || !product?._id) return
  try {
    await RecentlyViewed.findOneAndUpdate(
      { userId, productId: product._id },
      {
        $set: {
          lastViewedAt: new Date(),
          categoryIds: product.categoryIds ?? [],
          brand: product.brand,
          priceMinor: product.currentPriceMinor ?? product.minPriceMinor,
        },
        $inc: { viewCount: 1 },
      },
      { upsert: true },
    )
  } catch (error) {
    console.warn('[recommendations] could not record view:', error.message)
  }
}

export async function listRecentlyViewed(userId, { limit = 10 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 30)
  const views = await RecentlyViewed.find({ userId })
    .sort({ lastViewedAt: -1 })
    .limit(safeLimit)
    .lean()
  if (views.length === 0) return { items: [] }

  const products = await Product.find({
    _id: { $in: views.map((view) => view.productId) },
    status: 'active',
  })
    .select('title brand currentPriceMinor minPriceMinor currency ratingAverage ratingCount images')
    .lean()
  const byId = new Map(products.map((product) => [product._id.toString(), product]))

  return {
    items: views
      .map((view) => byId.get(view.productId.toString()))
      .filter(Boolean)
      .map((product) => presentable(product, 0, [], true)),
  }
}
