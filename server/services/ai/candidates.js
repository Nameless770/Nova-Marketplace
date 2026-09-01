import { Inventory } from '../../models/Inventory.js'
import { ProductVariant } from '../../models/ProductVariant.js'
import { searchProducts } from '../searchService.js'
import { formatMinor } from './format.js'

const MAX_CANDIDATES = 12
const DESCRIPTION_BUDGET = 320

function toMinor(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  const minor = Math.round(value * 100)
  return Number.isSafeInteger(minor) ? minor : undefined
}

function decimalToNumber(value) {
  const parsed = Number(value?.$numberDecimal ?? value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Turns extracted criteria into the deterministic search this app already runs.
 *
 * The model never queries MongoDB; it only shapes the filter, and every value it
 * produced is re-validated and clamped here before it reaches the database.
 */
export function criteriaToSearchQuery(criteria) {
  const query = { limit: MAX_CANDIDATES, sort: 'rating' }

  if (typeof criteria?.keywords === 'string' && criteria.keywords.trim())
    query.q = criteria.keywords.trim().slice(0, 120)

  const maxPrice = toMinor(criteria?.maxPrice)
  const minPrice = toMinor(criteria?.minPrice)
  if (maxPrice !== undefined) query.maxPrice = maxPrice
  if (minPrice !== undefined) query.minPrice = minPrice

  if (typeof criteria?.minRating === 'number' && criteria.minRating >= 0 && criteria.minRating <= 5)
    query.minRating = criteria.minRating

  if (criteria?.inStockOnly === true) query.availability = 'in_stock'

  return query
}

/**
 * Retrieves candidates and attaches authoritative stock. Returns both the
 * compact view handed to the model and a lookup used to rehydrate the response.
 */
export async function fetchCandidates(searchQuery) {
  let result
  try {
    result = await searchProducts(searchQuery)
  } catch (error) {
    // A malformed filter must degrade to a broader search, never to a 500.
    if (error.statusCode === 400) {
      result = await searchProducts({ q: searchQuery.q, limit: MAX_CANDIDATES, sort: 'rating' })
    } else {
      throw error
    }
  }

  const products = result.items ?? []
  if (products.length === 0) return { candidates: [], candidatesById: new Map() }

  const productIds = products.map((product) => product._id)
  const variants = await ProductVariant.find({ productId: { $in: productIds }, status: 'active' })
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
  const stockByProduct = new Map()
  for (const variant of variants) {
    const available = availableByVariant.get(variant._id.toString()) ?? 0
    const key = variant.productId.toString()
    stockByProduct.set(key, (stockByProduct.get(key) ?? 0) + available)
  }

  const candidatesById = new Map()
  const candidates = products.map((product) => {
    const id = product._id.toString()
    const priceMinor = product.currentPriceMinor ?? product.minPriceMinor ?? product.priceMinor ?? 0
    const currency = product.currency || 'USD'
    const ratingAverage = decimalToNumber(product.ratingAverage)
    const ratingCount = product.ratingCount ?? 0
    const inStock = (stockByProduct.get(id) ?? 0) > 0

    const record = {
      id,
      title: product.title,
      brand: product.brand ?? null,
      priceMinor,
      currency,
      ratingAverage,
      ratingCount,
      inStock,
      imageUrl: product.images?.[0]?.url ?? null,
      description: (product.description ?? '').slice(0, DESCRIPTION_BUDGET),
      // Pre-formatted for the prompt so the model never has to do arithmetic.
      priceLabel: formatMinor(priceMinor, currency),
      ratingLabel: ratingCount
        ? `${ratingAverage.toFixed(1)} from ${ratingCount} reviews`
        : 'no reviews yet',
    }
    candidatesById.set(id, record)
    return record
  })

  return { candidates, candidatesById }
}
