import mongoose from 'mongoose'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Product } from '../models/Product.js'
import { Review } from '../models/Review.js'
import { AppError } from '../utils/errors.js'
import { AUDIT, recordAudit } from './auditService.js'

function validId(value, code, message) {
  if (!mongoose.isValidObjectId(value)) throw new AppError(404, code, message)
}

async function refreshProductRating(productId, session) {
  const [summary] = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), status: 'published' } },
    { $group: { _id: '$productId', ratingAverage: { $avg: '$rating' }, ratingCount: { $sum: 1 } } },
  ]).session(session)
  await Product.updateOne(
    { _id: productId },
    {
      $set: { ratingAverage: summary?.ratingAverage ?? 0, ratingCount: summary?.ratingCount ?? 0 },
    },
    { session },
  )
}

export async function listProductReviews(productId, query) {
  validId(productId, 'PRODUCT_NOT_FOUND', 'Product not found')
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const filter = { productId, status: 'published' }
  if (query.rating) {
    const rating = Number(query.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new AppError(400, 'INVALID_RATING', 'Rating must be from 1 to 5')
    filter.rating = rating
  }
  const reviews = await Review.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()
  const hasMore = reviews.length > limit
  const items = reviews.slice(0, limit)
  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({ createdAt: items.at(-1).createdAt, id: items.at(-1)._id }),
      ).toString('base64url')
    : null
  const product = await Product.findById(productId).select('ratingAverage ratingCount').lean()
  return {
    items,
    ratingSummary: product ?? { ratingAverage: 0, ratingCount: 0 },
    meta: { nextCursor, hasMore },
  }
}

export async function createReview(customerId, productId, { rating, title, text, images }) {
  validId(productId, 'PRODUCT_NOT_FOUND', 'Product not found')
  const product = await Product.findById(productId).lean()
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
  const orderItem = await OrderItem.findOne({
    productId,
    // A partially refunded order is still a completed purchase. A fully
    // refunded one is not — the customer has their money back.
    orderId: {
      $in: await Order.find({
        customerId,
        paymentStatus: { $in: ['paid', 'partially_refunded'] },
      }).distinct('_id'),
    },
  })
    .sort({ createdAt: -1 })
    .lean()
  if (!orderItem)
    throw new AppError(
      403,
      'PURCHASE_REQUIRED',
      'Only customers who purchased this product can review it',
    )
  const existing = await Review.exists({ customerId, productId })
  if (existing)
    throw new AppError(409, 'REVIEW_ALREADY_EXISTS', 'You already reviewed this product')

  const session = await mongoose.startSession()
  try {
    let review
    await session.withTransaction(async () => {
      ;[review] = await Review.create(
        [
          {
            productId,
            sellerId: orderItem.sellerId,
            customerId,
            orderId: orderItem.orderId,
            orderItemId: orderItem._id,
            rating,
            title,
            text,
            images,
            verifiedPurchase: true,
            status: 'pending',
          },
        ],
        { session },
      )
    })
    return review
  } finally {
    await session.endSession()
  }
}

export async function updateReview(customerId, reviewId, data) {
  const session = await mongoose.startSession()
  try {
    let review
    await session.withTransaction(async () => {
      review = await Review.findOne({ _id: reviewId, customerId }).session(session)
      if (!review) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review not found')
      if (review.status === 'removed')
        throw new AppError(409, 'REVIEW_LOCKED', 'Removed reviews cannot be edited')
      Object.assign(review, data, {
        status: 'pending',
        moderationReason: undefined,
        verifiedPurchase: true,
      })
      await review.save({ session })
      await refreshProductRating(review.productId, session)
    })
    return review
  } finally {
    await session.endSession()
  }
}

export async function deleteReview(customerId, reviewId) {
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const review = await Review.findOne({ _id: reviewId, customerId }).session(session)
      if (!review) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review not found')
      const wasPublished = review.status === 'published'
      review.status = 'removed'
      await review.save({ session })
      if (wasPublished) await refreshProductRating(review.productId, session)
    })
  } finally {
    await session.endSession()
  }
}

export async function listReviewsForModeration(query) {
  const filter = query.status ? { status: query.status } : {}
  return Review.find(filter)
    .sort({ createdAt: 1, _id: 1 })
    .limit(Math.min(Number(query.limit) || 50, 100))
    .lean()
}

export async function moderateReview(reviewId, status, reason, context = {}) {
  validId(reviewId, 'REVIEW_NOT_FOUND', 'Review not found')
  const session = await mongoose.startSession()
  try {
    let review
    await session.withTransaction(async () => {
      review = await Review.findById(reviewId).session(session)
      if (!review) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review not found')
      await recordAudit(
        {
          actorId: context.actorId,
          actorRole: 'admin',
          action: AUDIT.REVIEW_MODERATED,
          targetType: 'Review',
          targetId: review._id,
          before: { status: review.status },
          after: { status },
          reason,
          ip: context.ip,
        },
        session,
      )
      review.status = status
      review.moderationReason = ['rejected', 'removed'].includes(status) ? reason : undefined
      review.verifiedPurchase = true
      await review.save({ session })
      await refreshProductRating(review.productId, session)
    })
    return review
  } finally {
    await session.endSession()
  }
}
