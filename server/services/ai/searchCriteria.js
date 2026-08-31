import mongoose from 'mongoose'
import { Category } from '../../models/Category.js'

// The complete set of search parameters the model is allowed to influence.
// Anything outside this list cannot be expressed, because the tool schema has no
// property for it and this module never copies unknown keys.
export const SORTS = ['price_asc', 'price_desc', 'rating', 'newest']

const MAX_KEYWORDS = 120
const MAX_TERM = 40
// A "cheap" request has no number attached, so it becomes a sort preference
// rather than an invented budget.
const RELATIVE_PRICE = ['cheap', 'budget', 'affordable', 'inexpensive', 'low price']

export const NL_SEARCH_TOOL = {
  name: 'product_search_criteria',
  description:
    'Translate a shopper\'s natural-language product search into structured criteria. Use null when the shopper did not specify something — never guess.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      keywords: {
        type: 'string',
        description:
          'Words describing the product and its features, e.g. "gaming laptop 16GB RAM". Exclude price, colour and brand words captured separately.',
      },
      category: {
        type: ['string', 'null'],
        description: 'A product category name if clearly implied, e.g. "laptops". Otherwise null.',
      },
      brand: { type: ['string', 'null'], description: 'A brand name if named, else null.' },
      color: { type: ['string', 'null'], description: 'A colour if specified, else null.' },
      size: { type: ['string', 'null'], description: 'A size if specified, else null.' },
      minPrice: {
        type: ['number', 'null'],
        description: 'Lower price bound in major currency units, or null.',
      },
      maxPrice: {
        type: ['number', 'null'],
        description: 'Upper price bound in major currency units, or null.',
      },
      minRating: {
        type: ['number', 'null'],
        description:
          'Minimum rating 1-5. Use 4 when the shopper asks for "good"/"well reviewed" quality, else null.',
      },
      inStockOnly: { type: 'boolean', description: 'True only if availability was implied.' },
      pricePreference: {
        type: ['string', 'null'],
        enum: ['cheap', 'premium', null],
        description:
          'Set to "cheap" for vague budget wording with no number, "premium" for high-end wording, else null.',
      },
    },
    required: [
      'keywords',
      'category',
      'brand',
      'color',
      'size',
      'minPrice',
      'maxPrice',
      'minRating',
      'inStockOnly',
      'pricePreference',
    ],
    additionalProperties: false,
  },
}

function cleanTerm(value, maxLength = MAX_TERM) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, maxLength)
  return trimmed.length ? trimmed : undefined
}

function priceToMinor(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  const minor = Math.round(value * 100)
  // Guard against absurd values that would blow past safe-integer arithmetic.
  return Number.isSafeInteger(minor) && minor <= 100_000_000_00 ? minor : undefined
}

/**
 * Turns raw model output into a validated search query.
 *
 * Nothing is passed through: each field is read by name, checked, and only then
 * written to a fresh object. Invalid values are dropped rather than rejected, so
 * a confused extraction degrades the search instead of failing it.
 *
 * Returns the query plus a record of what was discarded, which is what makes
 * misbehaviour visible instead of silent.
 */
export async function validateCriteria(raw, { fallbackQuery = '' } = {}) {
  const dropped = []
  const query = { limit: 24 }

  const keywords = cleanTerm(raw?.keywords, MAX_KEYWORDS) ?? cleanTerm(fallbackQuery, MAX_KEYWORDS)
  if (keywords) query.q = keywords

  const brand = cleanTerm(raw?.brand)
  if (brand) query.brand = brand
  else if (raw?.brand != null) dropped.push('brand')

  const color = cleanTerm(raw?.color)
  if (color) query.color = color
  else if (raw?.color != null) dropped.push('color')

  const size = cleanTerm(raw?.size)
  if (size) query.size = size
  else if (raw?.size != null) dropped.push('size')

  const minPrice = priceToMinor(raw?.minPrice)
  const maxPrice = priceToMinor(raw?.maxPrice)
  if (raw?.minPrice != null && minPrice === undefined) dropped.push('minPrice')
  if (raw?.maxPrice != null && maxPrice === undefined) dropped.push('maxPrice')

  // An inverted range would match nothing; swap rather than return zero results.
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    query.minPrice = maxPrice
    query.maxPrice = minPrice
  } else {
    if (minPrice !== undefined) query.minPrice = minPrice
    if (maxPrice !== undefined) query.maxPrice = maxPrice
  }

  const minRating = raw?.minRating
  if (typeof minRating === 'number' && minRating >= 0 && minRating <= 5)
    query.minRating = minRating
  else if (minRating != null) dropped.push('minRating')

  if (raw?.inStockOnly === true) query.availability = 'in_stock'

  // A category name is resolved against the database. The model never supplies
  // an id, and an unknown name drops the filter instead of matching nothing.
  const categoryName = cleanTerm(raw?.category, 60)
  if (categoryName) {
    const category = await Category.findOne({
      name: new RegExp(`^${categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      status: 'active',
    })
      .select('_id')
      .lean()
    if (category && mongoose.isValidObjectId(category._id)) query.categoryId = category._id.toString()
    else dropped.push('category')
  }

  // Vague budget wording becomes an ordering preference, never a made-up number.
  const preference = raw?.pricePreference
  if (preference === 'cheap' && query.maxPrice === undefined) query.sort = 'price_asc'
  else if (preference === 'premium' && query.minPrice === undefined) query.sort = 'price_desc'
  else if (query.minRating !== undefined) query.sort = 'rating'

  if (query.sort && !SORTS.includes(query.sort)) {
    delete query.sort
    dropped.push('sort')
  }

  return { query, dropped }
}

export function looksRelative(text) {
  const lowered = text.toLowerCase()
  return RELATIVE_PRICE.some((term) => lowered.includes(term))
}
