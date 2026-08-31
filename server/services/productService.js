import mongoose from 'mongoose'
import { Category } from '../models/Category.js'
import { Product } from '../models/Product.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { Seller } from '../models/Seller.js'
import { AppError } from '../utils/errors.js'
import { AUDIT, recordAudit } from './auditService.js'

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function cursorFor(document) {
  return Buffer.from(JSON.stringify({ createdAt: document.createdAt, id: document._id })).toString(
    'base64url',
  )
}

function parseCursor(value) {
  if (!value) return null
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString())
    if (!cursor.createdAt || !mongoose.isValidObjectId(cursor.id)) throw new Error()
    return cursor
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor')
  }
}

async function ownedSeller(userId) {
  const seller = await Seller.findOne({ ownerUserId: userId, status: 'approved' }).lean()
  if (!seller)
    throw new AppError(403, 'SELLER_NOT_APPROVED', 'Only approved sellers can manage products')
  return seller
}

async function ensureCategories(categoryIds) {
  const count = await Category.countDocuments({ _id: { $in: categoryIds }, status: 'active' })
  if (count !== categoryIds.length)
    throw new AppError(400, 'INVALID_CATEGORY', 'All categories must be active')
}

function publicProduct(product, variants = []) {
  return { ...product, id: product._id, variants }
}

export async function listCategories(parentId = null) {
  const filter = {
    status: 'active',
    parentId: parentId ? new mongoose.Types.ObjectId(parentId) : null,
  }
  return Category.find(filter).sort({ sortOrder: 1, name: 1 }).lean()
}

export async function createCategory({ name, slug, parentId, description }) {
  if (parentId) {
    const parent = await Category.exists({ _id: parentId, status: 'active' })
    if (!parent) throw new AppError(400, 'INVALID_PARENT_CATEGORY', 'Parent category not found')
  }
  return Category.create({
    name,
    slug: slugify(slug || name),
    parentId: parentId || null,
    description,
  })
}

export async function listProducts(query, sellerId = null) {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const cursor = parseCursor(query.cursor)
  const filter = { status: 'active' }
  if (sellerId) filter.sellerId = sellerId
  if (query.categoryId && mongoose.isValidObjectId(query.categoryId))
    filter.categoryIds = query.categoryId
  if (query.minPrice !== undefined)
    filter.currentPriceMinor = { ...(filter.currentPriceMinor || {}), $gte: Number(query.minPrice) }
  if (query.maxPrice !== undefined)
    filter.currentPriceMinor = { ...(filter.currentPriceMinor || {}), $lte: Number(query.maxPrice) }
  if (query.q?.trim()) filter.$text = { $search: query.q.trim() }
  if (cursor)
    filter.$or = [
      { createdAt: { $lt: new Date(cursor.createdAt) } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ]

  const sort =
    query.sort === 'price_asc'
      ? { currentPriceMinor: 1, _id: 1 }
      : query.sort === 'price_desc'
        ? { currentPriceMinor: -1, _id: -1 }
        : query.sort === 'rating'
          ? { ratingAverage: -1, _id: -1 }
          : { createdAt: -1, _id: -1 }
  const products = await Product.find(filter)
    .sort(sort)
    .limit(limit + 1)
    .lean()
  const hasMore = products.length > limit
  const items = products.slice(0, limit).map((product) => publicProduct(product))
  return { items, meta: { nextCursor: hasMore ? cursorFor(products[limit - 1]) : null, hasMore } }
}

export async function getProduct(productId, includeInactive = false) {
  if (!mongoose.isValidObjectId(productId))
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
  const filter = includeInactive ? { _id: productId } : { _id: productId, status: 'active' }
  const product = await Product.findOne(filter).lean()
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
  const variants = await ProductVariant.find({ productId, status: 'active' }).lean()
  return publicProduct(product, variants)
}

/**
 * A seller's own product, whatever its status.
 *
 * The public getProduct only returns active products, so without this a seller
 * cannot see the draft they just created. Ownership is enforced by ownedProduct,
 * so this can never reach another seller's catalogue.
 */
export async function getSellerProduct(userId, productId) {
  if (!mongoose.isValidObjectId(productId))
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
  const product = await ownedProduct(userId, productId)
  const variants = await ProductVariant.find({
    productId,
    status: { $ne: 'removed' },
  }).lean()
  return publicProduct(product.toObject(), variants)
}

export async function createProduct(userId, data) {
  const seller = await ownedSeller(userId)
  await ensureCategories(data.categoryIds)
  const slug = slugify(data.slug || data.title)
  if (!slug)
    throw new AppError(400, 'INVALID_SLUG', 'Product title must contain letters or numbers')
  return Product.create({ ...data, sellerId: seller._id, slug, status: 'draft' })
}

async function ownedProduct(userId, productId) {
  const seller = await ownedSeller(userId)
  const product = await Product.findOne({ _id: productId, sellerId: seller._id })
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
  return product
}

export async function updateProduct(userId, productId, data) {
  const product = await ownedProduct(userId, productId)
  if (data.categoryIds) await ensureCategories(data.categoryIds)
  const allowed = [
    'title',
    'description',
    'brand',
    'images',
    'attributes',
    'categoryIds',
    'priceMinor',
    'discountPercent',
    'hasVariants',
  ]
  allowed.forEach((field) => {
    if (data[field] !== undefined) product[field] = data[field]
  })
  if (data.title !== undefined && data.slug === undefined) product.slug = slugify(data.title)
  if (data.slug !== undefined) product.slug = slugify(data.slug)
  await product.save()
  return product
}

export async function removeProduct(userId, productId) {
  const product = await ownedProduct(userId, productId)
  product.status = 'removed'
  await product.save()
}

export async function submitProduct(userId, productId) {
  const product = await ownedProduct(userId, productId)
  if (!product.hasVariants && product.currentPriceMinor === undefined)
    throw new AppError(400, 'INVALID_PRODUCT', 'Product pricing is incomplete')
  product.status = 'pending_review'
  await product.save()
  return product
}

export async function createVariant(userId, productId, data) {
  const product = await ownedProduct(userId, productId)
  if (!product.hasVariants)
    throw new AppError(400, 'VARIANTS_NOT_ENABLED', 'Enable variants on the product first')
  const seller = await ownedSeller(userId)
  const variant = await ProductVariant.create({ ...data, productId, sellerId: seller._id })
  const prices = await ProductVariant.find({ productId, status: 'active' })
    .select('currentPriceMinor')
    .lean()
  const minPriceMinor = Math.min(...prices.map((item) => item.currentPriceMinor))
  await Product.updateOne(
    { _id: productId },
    {
      $set: {
        minPriceMinor,
        maxPriceMinor: Math.max(...prices.map((item) => item.currentPriceMinor)),
        // Search filters and sorts price on currentPriceMinor. Without this a
        // variant product has no value in that field, so every price-range
        // query silently excluded it.
        currentPriceMinor: minPriceMinor,
      },
    },
  )
  return variant
}

export async function updateVariant(userId, productId, variantId, data) {
  await ownedProduct(userId, productId)
  const variant = await ProductVariant.findOne({
    _id: variantId,
    productId,
    sellerId: (await ownedSeller(userId))._id,
  })
  if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found')
  const allowed = [
    'sku',
    'name',
    'size',
    'color',
    'options',
    'priceMinor',
    'discountPercent',
    'status',
  ]
  allowed.forEach((field) => {
    if (data[field] !== undefined) variant[field] = data[field]
  })
  await variant.save()
  return variant
}

export async function removeVariant(userId, productId, variantId) {
  const product = await ownedProduct(userId, productId)
  const variant = await ProductVariant.findOne({
    _id: variantId,
    productId,
    sellerId: product.sellerId,
  })
  if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found')
  variant.status = 'removed'
  await variant.save()
}

export async function moderateProduct(productId, status, context = {}) {
  const product = await Product.findById(productId)
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
  const previousStatus = product.status
  product.status = status
  await product.save()

  await recordAudit({
    actorId: context.actorId,
    actorRole: 'admin',
    action: AUDIT.PRODUCT_MODERATED,
    targetType: 'Product',
    targetId: product._id,
    before: { status: previousStatus },
    after: { status },
    ip: context.ip,
  })

  return product
}

export async function listAdminProducts(query) {
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100)
  const filter = {}
  if (query.status) filter.status = query.status
  if (query.sellerId && mongoose.isValidObjectId(query.sellerId)) filter.sellerId = query.sellerId
  const products = await Product.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean()
  return {
    items: products.map((item) => publicProduct(item)),
    meta: { nextCursor: null, hasMore: false },
  }
}

export async function removeProductAsAdmin(productId) {
  return moderateProduct(productId, 'removed')
}
