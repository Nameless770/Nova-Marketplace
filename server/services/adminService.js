import mongoose from 'mongoose'
import { Category } from '../models/Category.js'
import { Coupon } from '../models/Coupon.js'
import { Inventory } from '../models/Inventory.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Product } from '../models/Product.js'
import { Review } from '../models/Review.js'
import { Seller } from '../models/Seller.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/errors.js'

const MAX_RANGE_DAYS = 365
const DEFAULT_RANGE_DAYS = 30

// Admin tables use offset pagination by design (see architecture note on
// pagination); operational customer/seller lists stay on cursors.
function paginate(query) {
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100)
  const page = Math.max(Number(query.page) || 1, 1)
  return { limit, page, skip: (page - 1) * limit }
}

function meta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
}

// Anchored + escaped so admin search cannot inject regex or force a ReDoS.
function searchRegex(term) {
  const escaped = term.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}`, 'i')
}

function sortSpec(query, allowed, fallback) {
  const field = allowed.includes(query.sortBy) ? query.sortBy : fallback
  const direction = query.sortDir === 'asc' ? 1 : -1
  return { [field]: direction, _id: direction }
}

export function resolveRange({ from, to } = {}) {
  const parsedTo = to ? new Date(to) : new Date()
  if (Number.isNaN(parsedTo.getTime()))
    throw new AppError(400, 'INVALID_DATE_RANGE', 'Invalid "to" date')
  const parsedFrom = from
    ? new Date(from)
    : new Date(parsedTo.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000)
  if (Number.isNaN(parsedFrom.getTime()))
    throw new AppError(400, 'INVALID_DATE_RANGE', 'Invalid "from" date')
  if (parsedFrom > parsedTo)
    throw new AppError(400, 'INVALID_DATE_RANGE', '"from" must be before "to"')
  if ((parsedTo - parsedFrom) / (24 * 60 * 60 * 1000) > MAX_RANGE_DAYS)
    throw new AppError(400, 'DATE_RANGE_TOO_LARGE', `Range must not exceed ${MAX_RANGE_DAYS} days`)
  return { from: parsedFrom, to: parsedTo }
}

export async function getPlatformOverview(query = {}) {
  const range = resolveRange(query)
  const paidInRange = {
    paymentStatus: 'paid',
    createdAt: { $gte: range.from, $lte: range.to },
  }

  const [
    revenueAllTime,
    revenueInRange,
    revenueSeries,
    orderStatuses,
    customers,
    sellers,
    products,
    lowStock,
    pendingReviews,
    activeCoupons,
    topSellers,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, revenueMinor: { $sum: '$totalMinor' }, orders: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: paidInRange },
      { $group: { _id: null, revenueMinor: { $sum: '$totalMinor' }, orders: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: paidInRange },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenueMinor: { $sum: '$totalMinor' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Seller.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Product.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Inventory.countDocuments({ $expr: { $lte: ['$quantityAvailable', '$lowStockThreshold'] } }),
    Review.countDocuments({ status: 'pending' }),
    Coupon.countDocuments({ status: 'active' }),
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
      { $match: { 'order.paymentStatus': 'paid' } },
      {
        $group: {
          _id: '$sellerId',
          revenueMinor: { $sum: '$lineTotalMinor' },
          unitsSold: { $sum: '$quantity' },
        },
      },
      { $sort: { revenueMinor: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: Seller.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'seller',
        },
      },
      { $unwind: '$seller' },
      {
        $project: {
          sellerId: '$_id',
          storeName: '$seller.storeName',
          revenueMinor: 1,
          unitsSold: 1,
        },
      },
    ]),
  ])

  const tally = (rows) => rows.reduce((totals, row) => ({ ...totals, [row._id]: row.count }), {})
  const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0)

  const customerCounts = tally(customers)
  const sellerCounts = tally(sellers)
  const productCounts = tally(products)
  const orderCounts = tally(orderStatuses)

  return {
    period: { from: range.from, to: range.to },
    revenue: {
      allTimeMinor: revenueAllTime[0]?.revenueMinor ?? 0,
      periodMinor: revenueInRange[0]?.revenueMinor ?? 0,
      paidOrdersAllTime: revenueAllTime[0]?.orders ?? 0,
      paidOrdersInPeriod: revenueInRange[0]?.orders ?? 0,
    },
    series: revenueSeries.map((row) => ({
      date: row._id,
      revenueMinor: row.revenueMinor,
      orders: row.orders,
    })),
    orders: { total: total(orderCounts), byStatus: orderCounts },
    users: { total: total(customerCounts), byStatus: customerCounts },
    sellers: {
      total: total(sellerCounts),
      pending: sellerCounts.pending ?? 0,
      approved: sellerCounts.approved ?? 0,
      suspended: sellerCounts.suspended ?? 0,
      byStatus: sellerCounts,
    },
    products: { total: total(productCounts), active: productCounts.active ?? 0 },
    moderation: { pendingReviews, lowStock, activeCoupons },
    topSellers,
  }
}

export async function listPlatformUsers(query) {
  const page = paginate(query)
  const filter = {}
  if (query.role) filter.role = query.role
  if (query.status) filter.status = query.status
  if (query.q?.trim()) {
    const term = searchRegex(query.q)
    filter.$or = [{ email: term }, { firstName: term }, { lastName: term }]
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('email firstName lastName role status sellerApprovalStatus createdAt')
      .sort(sortSpec(query, ['createdAt', 'email', 'role', 'status'], 'createdAt'))
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    User.countDocuments(filter),
  ])
  return { items, meta: meta(page, total) }
}

export async function setUserStatus(adminUserId, userId, status) {
  if (!mongoose.isValidObjectId(userId))
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found')
  if (!['active', 'suspended'].includes(status))
    throw new AppError(400, 'INVALID_STATUS', 'Status must be active or suspended')
  if (userId === adminUserId.toString())
    throw new AppError(409, 'SELF_MODERATION', 'Admins cannot change their own account status')

  const user = await User.findById(userId)
  if (!user || user.status === 'deleted')
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found')
  if (user.role === 'admin')
    throw new AppError(403, 'ADMIN_IMMUTABLE', 'Admin accounts cannot be suspended here')

  user.status = status
  await user.save()
  return {
    id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
  }
}

export async function listPlatformSellers(query) {
  const page = paginate(query)
  const filter = {}
  if (query.status) filter.status = query.status
  if (query.q?.trim()) filter.storeName = searchRegex(query.q)

  const [items, total] = await Promise.all([
    Seller.find(filter)
      .sort(sortSpec(query, ['createdAt', 'storeName', 'status'], 'createdAt'))
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Seller.countDocuments(filter),
  ])
  return { items, meta: meta(page, total) }
}

export async function listPlatformProducts(query) {
  const page = paginate(query)
  const filter = {}
  if (query.status) filter.status = query.status
  if (query.sellerId && mongoose.isValidObjectId(query.sellerId)) filter.sellerId = query.sellerId
  if (query.q?.trim()) filter.title = searchRegex(query.q)

  const [items, total] = await Promise.all([
    Product.find(filter)
      .select('title slug status sellerId currentPriceMinor ratingAverage ratingCount createdAt')
      .sort(sortSpec(query, ['createdAt', 'title', 'status', 'currentPriceMinor'], 'createdAt'))
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Product.countDocuments(filter),
  ])
  return { items, meta: meta(page, total) }
}

export async function listPlatformReviews(query) {
  const page = paginate(query)
  const filter = {}
  if (query.status) filter.status = query.status
  if (query.rating) {
    const rating = Number(query.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new AppError(400, 'INVALID_RATING', 'Rating must be from 1 to 5')
    filter.rating = rating
  }

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .select('productId sellerId rating title text status verifiedPurchase createdAt')
      .sort(sortSpec(query, ['createdAt', 'rating', 'status'], 'createdAt'))
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Review.countDocuments(filter),
  ])

  const products = await Product.find({ _id: { $in: reviews.map((r) => r.productId) } })
    .select('title')
    .lean()
  const titleById = new Map(products.map((product) => [product._id.toString(), product.title]))

  return {
    items: reviews.map((review) => ({
      ...review,
      productTitle: titleById.get(review.productId?.toString()) ?? 'Unknown product',
    })),
    meta: meta(page, total),
  }
}

export async function listPlatformOrders(query) {
  const page = paginate(query)
  const filter = {}
  if (query.status) filter.status = query.status
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus
  if (query.q?.trim()) filter.orderNumber = searchRegex(query.q)

  const [items, total] = await Promise.all([
    Order.find(filter)
      .select('orderNumber status paymentStatus totalMinor currency customerId createdAt')
      .sort(sortSpec(query, ['createdAt', 'totalMinor', 'status'], 'createdAt'))
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Order.countDocuments(filter),
  ])
  return { items, meta: meta(page, total) }
}

export async function listPlatformInventory(query) {
  const page = paginate(query)
  const filter = {}
  if (query.lowStock === 'true')
    filter.$expr = { $lte: ['$quantityAvailable', '$lowStockThreshold'] }
  if (query.status) filter.status = query.status
  if (query.q?.trim()) filter.sku = searchRegex(query.q)

  const [items, total] = await Promise.all([
    Inventory.find(filter)
      .sort(sortSpec(query, ['quantityAvailable', 'updatedAt'], 'quantityAvailable'))
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Inventory.countDocuments(filter),
  ])
  return { items, meta: meta(page, total) }
}

export async function listPlatformCategories(query) {
  const page = paginate(query)
  const filter = {}
  if (query.status) filter.status = query.status
  if (query.q?.trim()) filter.name = searchRegex(query.q)

  const [items, total] = await Promise.all([
    Category.find(filter)
      .sort(sortSpec(query, ['createdAt', 'name', 'sortOrder'], 'sortOrder'))
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Category.countDocuments(filter),
  ])
  return { items, meta: meta(page, total) }
}

export async function updatePlatformCategory(categoryId, { name, description, status, sortOrder }) {
  if (!mongoose.isValidObjectId(categoryId))
    throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found')
  const category = await Category.findById(categoryId)
  if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found')

  if (name !== undefined) category.name = name.trim()
  if (description !== undefined) category.description = description.trim()
  if (status !== undefined) category.status = status
  if (sortOrder !== undefined) category.sortOrder = sortOrder
  await category.save()
  return category.toObject()
}

export async function listPlatformCoupons(query) {
  const page = paginate(query)
  const filter = {}
  if (query.status) filter.status = query.status
  if (query.ownerType) filter.ownerType = query.ownerType
  if (query.q?.trim()) filter.code = searchRegex(query.q)

  const [items, total] = await Promise.all([
    Coupon.find(filter)
      .sort(sortSpec(query, ['createdAt', 'code', 'expiresAt', 'usageCount'], 'createdAt'))
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Coupon.countDocuments(filter),
  ])
  return { items, meta: meta(page, total) }
}

export async function setCouponStatus(couponId, status) {
  if (!mongoose.isValidObjectId(couponId))
    throw new AppError(404, 'COUPON_NOT_FOUND', 'Coupon not found')
  if (!['active', 'inactive'].includes(status))
    throw new AppError(400, 'INVALID_STATUS', 'Status must be active or inactive')

  const coupon = await Coupon.findById(couponId)
  if (!coupon) throw new AppError(404, 'COUPON_NOT_FOUND', 'Coupon not found')
  if (coupon.status === 'expired')
    throw new AppError(409, 'COUPON_EXPIRED', 'An expired coupon cannot be reactivated')

  coupon.status = status
  await coupon.save()
  return coupon.toObject()
}
