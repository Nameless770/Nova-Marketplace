import mongoose from 'mongoose'
import { Inventory } from '../models/Inventory.js'
import { Notification } from '../models/Notification.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Product } from '../models/Product.js'
import { Refund } from '../models/Refund.js'
import { Review } from '../models/Review.js'
import { Seller } from '../models/Seller.js'
import { SellerApplication } from '../models/SellerApplication.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/errors.js'
import { AUDIT, recordAudit } from './auditService.js'

const MAX_ANALYTICS_RANGE_DAYS = 365
const DEFAULT_ANALYTICS_RANGE_DAYS = 30

// Revenue is only recognised for orders Stripe has confirmed as paid. Until
// SellerLedgerEntries exist this is the authoritative seller revenue figure.
// A partially refunded order is still a captured sale — excluding it would drop
// the whole order's revenue instead of just the refunded part.
const PAID_ORDER_MATCH = { 'order.paymentStatus': { $in: ['paid', 'partially_refunded'] } }

// Derived from authoritative quantities rather than the denormalized isLowStock
// flag, so a drifted cache cannot hide a stock-out from the seller.
function lowStockFilter(sellerId) {
  return {
    sellerId,
    $expr: { $lte: ['$quantityAvailable', '$lowStockThreshold'] },
  }
}

function resolveRange({ from, to } = {}) {
  const parsedTo = to ? new Date(to) : new Date()
  if (Number.isNaN(parsedTo.getTime()))
    throw new AppError(400, 'INVALID_DATE_RANGE', 'Invalid "to" date')

  const parsedFrom = from
    ? new Date(from)
    : new Date(parsedTo.getTime() - DEFAULT_ANALYTICS_RANGE_DAYS * 24 * 60 * 60 * 1000)
  if (Number.isNaN(parsedFrom.getTime()))
    throw new AppError(400, 'INVALID_DATE_RANGE', 'Invalid "from" date')
  if (parsedFrom > parsedTo)
    throw new AppError(400, 'INVALID_DATE_RANGE', '"from" must be before "to"')

  const rangeDays = (parsedTo - parsedFrom) / (24 * 60 * 60 * 1000)
  if (rangeDays > MAX_ANALYTICS_RANGE_DAYS)
    throw new AppError(
      400,
      'DATE_RANGE_TOO_LARGE',
      `Date range must not exceed ${MAX_ANALYTICS_RANGE_DAYS} days`,
    )

  return { from: parsedFrom, to: parsedTo }
}

function paidOrderPipeline(sellerId, range) {
  return [
    { $match: { sellerId, createdAt: { $gte: range.from, $lte: range.to } } },
    {
      $lookup: {
        from: Order.collection.name,
        localField: 'orderId',
        foreignField: '_id',
        as: 'order',
      },
    },
    { $unwind: '$order' },
    { $match: PAID_ORDER_MATCH },
  ]
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function publicSeller(seller) {
  return {
    id: seller._id,
    ownerUserId: seller.ownerUserId,
    storeName: seller.storeName,
    slug: seller.slug,
    description: seller.description,
    image: seller.image,
    status: seller.status,
    ratingAverage: seller.ratingAverage,
    ratingCount: seller.ratingCount,
    approvedAt: seller.approvedAt,
    createdAt: seller.createdAt,
    updatedAt: seller.updatedAt,
  }
}

async function getOwnedSeller(userId) {
  const seller = await Seller.findOne({ ownerUserId: userId })
  if (!seller) throw new AppError(404, 'SELLER_NOT_FOUND', 'Seller profile not found')
  return seller
}

export async function applyAsSeller(userId, { storeName, legalName, country, contactEmail }) {
  const existing = await Seller.findOne({ ownerUserId: userId })
  if (existing) throw new AppError(409, 'SELLER_PROFILE_EXISTS', 'A seller profile already exists')

  const slug = slugify(storeName)
  if (!slug)
    throw new AppError(400, 'INVALID_STORE_NAME', 'Store name must contain letters or numbers')
  if (await Seller.exists({ slug }))
    throw new AppError(409, 'STORE_NAME_EXISTS', 'That store name is unavailable')

  const session = await mongoose.startSession()
  try {
    let application
    await session.withTransaction(async () => {
      const [seller] = await Seller.create([{ ownerUserId: userId, storeName, slug }], { session })
      ;[application] = await SellerApplication.create(
        [
          {
            userId,
            sellerId: seller._id,
            storeName,
            businessDetails: {
              legalName,
              country: country.toUpperCase(),
              contactEmail: contactEmail.toLowerCase(),
            },
          },
        ],
        { session },
      )
      await User.updateOne(
        { _id: userId },
        { $set: { sellerId: seller._id, sellerApprovalStatus: 'pending' } },
        { session },
      )
    })
    return application
  } finally {
    await session.endSession()
  }
}

export async function getMySeller(userId) {
  return publicSeller(await getOwnedSeller(userId))
}

export async function updateMySeller(userId, { storeName, description, image }) {
  const seller = await getOwnedSeller(userId)
  if (seller.status === 'suspended')
    throw new AppError(403, 'SELLER_SUSPENDED', 'Suspended sellers cannot update their store')
  if (storeName !== undefined && storeName.trim() !== seller.storeName) {
    const slug = slugify(storeName)
    if (await Seller.exists({ _id: { $ne: seller._id }, slug }))
      throw new AppError(409, 'STORE_NAME_EXISTS', 'That store name is unavailable')
    seller.storeName = storeName.trim()
    seller.slug = slug
  }
  if (description !== undefined) seller.description = description.trim()
  if (image !== undefined) seller.image = image
  await seller.save()
  return publicSeller(seller)
}

export async function getMyApplication(userId) {
  const application = await SellerApplication.findOne({ userId }).sort({ createdAt: -1 }).lean()
  if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Seller application not found')
  return application
}

export async function moderateSeller(sellerId, adminId, status, reason, context = {}) {
  const session = await mongoose.startSession()
  try {
    let seller
    await session.withTransaction(async () => {
      seller = await Seller.findById(sellerId).session(session)
      if (!seller) throw new AppError(404, 'SELLER_NOT_FOUND', 'Seller profile not found')
      if (status === 'approved' && seller.status === 'approved') return
      const previousStatus = seller.status
      // Written inside the same transaction, so the decision and its record
      // commit together — neither can exist without the other.
      await recordAudit(
        {
          actorId: adminId,
          actorRole: 'admin',
          action: AUDIT.SELLER_MODERATED,
          targetType: 'Seller',
          targetId: seller._id,
          before: { status: previousStatus },
          after: { status },
          reason,
          ip: context.ip,
        },
        session,
      )
      seller.status = status
      seller.rejectionReason = status === 'rejected' ? reason : undefined
      seller.suspensionReason = status === 'suspended' ? reason : undefined
      seller.approvedAt = status === 'approved' ? new Date() : seller.approvedAt
      await seller.save({ session })

      const userUpdate =
        status === 'approved'
          ? { role: 'seller', status: 'active', sellerApprovalStatus: 'approved' }
          : { sellerApprovalStatus: status === 'suspended' ? 'suspended' : status }
      await User.updateOne({ _id: seller.ownerUserId }, { $set: userUpdate }, { session })
      await SellerApplication.updateMany(
        { sellerId: seller._id, status: { $in: ['pending', 'approved'] } },
        {
          $set: {
            status,
            reviewedBy: adminId,
            reviewedAt: new Date(),
            rejectionReason: status === 'rejected' ? reason : undefined,
          },
        },
        { session },
      )
    })
    return publicSeller(seller)
  } finally {
    await session.endSession()
  }
}

export async function getSellerDashboard(userId) {
  const seller = await getOwnedSeller(userId)
  const sellerId = seller._id

  const [productCounts, orderCounts, revenue, lowStockCount, unreadNotifications] =
    await Promise.all([
      Product.aggregate([
        { $match: { sellerId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SellerOrder.aggregate([
        { $match: { sellerId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SellerOrder.aggregate([
        ...paidOrderPipeline(sellerId, {
          from: new Date(0),
          to: new Date(),
        }),
        { $group: { _id: null, revenueMinor: { $sum: '$totalMinor' }, orders: { $sum: 1 } } },
      ]),
      Inventory.countDocuments(lowStockFilter(sellerId)),
      Notification.countDocuments({ recipientUserId: userId, status: 'unread' }),
    ])

  const byStatus = (rows) => rows.reduce((totals, row) => ({ ...totals, [row._id]: row.count }), {})
  const products = byStatus(productCounts)
  const orders = byStatus(orderCounts)
  const sum = (counts) => Object.values(counts).reduce((total, count) => total + count, 0)

  return {
    seller: publicSeller(seller),
    products: { total: sum(products), active: products.active ?? 0, byStatus: products },
    orders: {
      total: sum(orders),
      pending: (orders.pending ?? 0) + (orders.confirmed ?? 0) + (orders.processing ?? 0),
      byStatus: orders,
    },
    revenueMinor: revenue[0]?.revenueMinor ?? 0,
    paidOrders: revenue[0]?.orders ?? 0,
    lowStockCount,
    unreadNotifications,
  }
}

export async function getSellerProducts(userId, query) {
  const seller = await getOwnedSeller(userId)
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100)
  const filter = { sellerId: seller._id }
  if (query.status) filter.status = query.status

  const products = await Product.find(filter)
    .select('title slug status currentPriceMinor minPriceMinor ratingAverage ratingCount createdAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  const hasMore = products.length > limit
  return { items: products.slice(0, limit), meta: { nextCursor: null, hasMore } }
}

export async function getSellerOrders(userId, query) {
  const seller = await getOwnedSeller(userId)
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100)
  const filter = { sellerId: seller._id }
  if (query.status) filter.status = query.status

  const sellerOrders = await SellerOrder.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  const hasMore = sellerOrders.length > limit
  return { items: sellerOrders.slice(0, limit), meta: { nextCursor: null, hasMore } }
}

export async function getSellerReviews(userId, query) {
  const seller = await getOwnedSeller(userId)
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100)
  const filter = { sellerId: seller._id, status: 'published' }
  if (query.rating) {
    const rating = Number(query.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new AppError(400, 'INVALID_RATING', 'Rating must be from 1 to 5')
    filter.rating = rating
  }

  const reviews = await Review.find(filter)
    .select('productId rating title text verifiedPurchase createdAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  const hasMore = reviews.length > limit
  const items = reviews.slice(0, limit)
  const productTitles = await Product.find({ _id: { $in: items.map((item) => item.productId) } })
    .select('title')
    .lean()
  const titleById = new Map(productTitles.map((product) => [product._id.toString(), product.title]))

  return {
    items: items.map((item) => ({
      ...item,
      productTitle: titleById.get(item.productId.toString()) ?? 'Unknown product',
    })),
    ratingSummary: { ratingAverage: seller.ratingAverage, ratingCount: seller.ratingCount },
    meta: { nextCursor: null, hasMore },
  }
}

export async function getSellerAnalytics(userId, query = {}) {
  const seller = await getOwnedSeller(userId)
  const sellerId = seller._id
  const range = resolveRange(query)

  const [totals, units, bestSellers, lowStock, refunded] = await Promise.all([
    SellerOrder.aggregate([
      ...paidOrderPipeline(sellerId, range),
      {
        $group: {
          _id: null,
          revenueMinor: { $sum: '$totalMinor' },
          orders: { $sum: 1 },
          discountMinor: { $sum: '$discountMinor' },
        },
      },
    ]),
    OrderItem.aggregate([
      ...paidOrderPipeline(sellerId, range),
      { $group: { _id: null, unitsSold: { $sum: '$quantity' } } },
    ]),
    OrderItem.aggregate([
      ...paidOrderPipeline(sellerId, range),
      {
        $group: {
          _id: '$productId',
          title: { $first: '$productSnapshot.title' },
          imageUrl: { $first: '$productSnapshot.imageUrl' },
          unitsSold: { $sum: '$quantity' },
          revenueMinor: { $sum: '$lineTotalMinor' },
        },
      },
      { $sort: { unitsSold: -1, revenueMinor: -1 } },
      { $limit: 5 },
    ]),
    Inventory.find(lowStockFilter(sellerId))
      .select('sku variantId productId quantityAvailable quantityOnHand lowStockThreshold status')
      .sort({ quantityAvailable: 1, _id: 1 })
      .limit(10)
      .lean(),
    // Attribution comes from the per-seller allocation, not the initiating
    // seller, so admin-issued refunds still reduce the right seller's revenue.
    Refund.aggregate([
      { $match: { status: 'succeeded', createdAt: { $gte: range.from, $lte: range.to } } },
      { $unwind: '$allocations' },
      { $match: { 'allocations.sellerId': sellerId } },
      {
        $group: {
          _id: null,
          refundedMinor: { $sum: '$allocations.amountMinor' },
          count: { $sum: 1 },
        },
      },
    ]),
  ])

  const grossRevenueMinor = totals[0]?.revenueMinor ?? 0
  const refundedMinor = refunded[0]?.refundedMinor ?? 0

  return {
    period: { from: range.from, to: range.to },
    metrics: {
      // Headline revenue is net of refunds; gross is kept alongside it so the
      // two are never confused.
      revenueMinor: Math.max(0, grossRevenueMinor - refundedMinor),
      grossRevenueMinor,
      refundedMinor,
      refundCount: refunded[0]?.count ?? 0,
      discountMinor: totals[0]?.discountMinor ?? 0,
      orders: totals[0]?.orders ?? 0,
      unitsSold: units[0]?.unitsSold ?? 0,
    },
    bestSellers: bestSellers.map((row) => ({
      productId: row._id,
      title: row.title,
      imageUrl: row.imageUrl,
      unitsSold: row.unitsSold,
      revenueMinor: row.revenueMinor,
    })),
    lowStock,
  }
}
