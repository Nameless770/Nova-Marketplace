import mongoose from 'mongoose'
import { Inventory } from '../models/Inventory.js'
import { Product } from '../models/Product.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { AppError } from '../utils/errors.js'

function encodeCursor(document, sort) {
  const value =
    sort === 'price_asc' || sort === 'price_desc'
      ? document.currentPriceMinor
      : sort === 'rating'
        ? document.ratingAverage?.toString()
        : document.createdAt
  return Buffer.from(JSON.stringify({ value, id: document._id.toString(), sort })).toString(
    'base64url',
  )
}

function decodeCursor(rawCursor) {
  if (!rawCursor) return null
  try {
    const cursor = JSON.parse(Buffer.from(rawCursor, 'base64url').toString())
    if (cursor.value === undefined || cursor.value === null || !mongoose.isValidObjectId(cursor.id))
      throw new Error()
    return cursor
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor')
  }
}

function numericFilter(value, field) {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0)
    throw new AppError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be a non-negative integer`,
    )
  return number
}

async function variantProductIds(query) {
  const variantFilter = { status: 'active' }
  if (query.size) variantFilter.size = query.size.trim()
  if (query.color) variantFilter.color = query.color.trim()
  if (!query.size && !query.color) return null
  return ProductVariant.distinct('productId', variantFilter)
}

async function availableProductIds() {
  const variantIds = await Inventory.distinct('variantId', {
    status: { $in: ['active', 'out_of_stock'] },
    quantityAvailable: { $gt: 0 },
  })
  return ProductVariant.distinct('productId', { _id: { $in: variantIds }, status: 'active' })
}

export async function searchProducts(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const sortName = ['price_asc', 'price_desc', 'rating', 'newest'].includes(query.sort)
    ? query.sort
    : 'newest'
  const cursor = decodeCursor(query.cursor)
  if (cursor && cursor.sort !== sortName)
    throw new AppError(400, 'INVALID_CURSOR', 'Cursor sort does not match the request')
  const filter = { status: 'active' }

  if (query.categoryId) {
    if (!mongoose.isValidObjectId(query.categoryId))
      throw new AppError(400, 'INVALID_CATEGORY', 'Invalid category')
    filter.categoryIds = query.categoryId
  }
  if (query.sellerId) {
    if (!mongoose.isValidObjectId(query.sellerId))
      throw new AppError(400, 'INVALID_SELLER', 'Invalid seller')
    filter.sellerId = query.sellerId
  }
  if (query.brand?.trim()) filter.brand = query.brand.trim()
  const minPrice = numericFilter(query.minPrice, 'min_price')
  const maxPrice = numericFilter(query.maxPrice, 'max_price')
  const minRating = query.minRating === undefined ? undefined : Number(query.minRating)
  if (minPrice !== undefined || maxPrice !== undefined)
    filter.currentPriceMinor = {
      ...(minPrice !== undefined ? { $gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { $lte: maxPrice } : {}),
    }
  if (minRating !== undefined) {
    if (!Number.isFinite(minRating) || minRating < 0 || minRating > 5)
      throw new AppError(400, 'INVALID_RATING', 'Rating must be between 0 and 5')
    filter.ratingAverage = { $gte: minRating }
  }
  if (query.q?.trim()) filter.$text = { $search: query.q.trim() }

  const [variantIds, availableIds] = await Promise.all([
    variantProductIds(query),
    query.availability === 'in_stock' ? availableProductIds() : null,
  ])
  if (variantIds) filter._id = { $in: variantIds }
  if (availableIds) filter._id = { ...(filter._id || {}), $in: availableIds }

  const sort =
    sortName === 'price_asc'
      ? { currentPriceMinor: 1, _id: 1 }
      : sortName === 'price_desc'
        ? { currentPriceMinor: -1, _id: -1 }
        : sortName === 'rating'
          ? { ratingAverage: -1, _id: -1 }
          : { createdAt: -1, _id: -1 }
  if (cursor) {
    const operator = sortName === 'price_asc' ? '$gt' : '$lt'
    const field =
      sortName === 'price_asc' || sortName === 'price_desc'
        ? 'currentPriceMinor'
        : sortName === 'rating'
          ? 'ratingAverage'
          : 'createdAt'
    const value =
      field === 'createdAt'
        ? new Date(cursor.value)
        : field === 'ratingAverage'
          ? mongoose.Types.Decimal128.fromString(String(cursor.value))
          : cursor.value
    filter.$and = [
      {
        $or: [
          { [field]: { [operator]: value } },
          { [field]: value, _id: { [operator]: cursor.id } },
        ],
      },
    ]
  }

  const products = await Product.find(filter)
    .sort(sort)
    .limit(limit + 1)
    .lean()
  const hasMore = products.length > limit
  const items = products.slice(0, limit)
  return {
    items,
    meta: { nextCursor: hasMore ? encodeCursor(items.at(-1), sortName) : null, hasMore },
  }
}
