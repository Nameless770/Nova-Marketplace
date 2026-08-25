import { Coupon } from '../models/Coupon.js'
import { CouponRedemption } from '../models/CouponRedemption.js'
import { Seller } from '../models/Seller.js'
import { AppError } from '../utils/errors.js'

function normalizedCode(code) {
  return code.trim().toUpperCase()
}

export async function createCoupon(userId, data, ownerType) {
  let ownerId
  if (ownerType === 'seller') {
    const seller = await Seller.findOne({ ownerUserId: userId, status: 'approved' }).lean()
    if (!seller) throw new AppError(403, 'SELLER_NOT_APPROVED', 'Seller is not approved')
    ownerId = seller._id
  }
  if (new Date(data.expiresAt) <= new Date(data.startsAt ?? Date.now()))
    throw new AppError(400, 'INVALID_COUPON_DATES', 'expiresAt must be after startsAt')
  return Coupon.create({
    ...data,
    code: normalizedCode(data.code),
    ownerType,
    ownerId,
    createdBy: userId,
  })
}

export async function listCoupons(userId, ownerType, query) {
  const filter =
    ownerType === 'seller'
      ? {
          ownerType,
          ownerId: (await Seller.findOne({ ownerUserId: userId }).select('_id').lean())?._id,
        }
      : query.status
        ? { status: query.status }
        : {}
  return Coupon.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(Number(query.limit) || 50, 100))
    .lean()
}

export async function calculateCoupon(code, customerId, items, currency, session) {
  const coupon = await Coupon.findOne({ code: normalizedCode(code) })
    .session(session)
    .lean()
  const now = new Date()
  if (!coupon || coupon.status !== 'active' || now < coupon.startsAt || now >= coupon.expiresAt)
    throw new AppError(400, 'INVALID_COUPON', 'Coupon is invalid or expired')
  if (coupon.currency && coupon.currency !== currency)
    throw new AppError(400, 'COUPON_CURRENCY_MISMATCH', 'Coupon currency does not match the order')
  const eligibleItems =
    coupon.ownerType === 'seller'
      ? items.filter((item) => item.seller._id.toString() === coupon.ownerId.toString())
      : items
  if (!eligibleItems.length)
    throw new AppError(403, 'UNAUTHORIZED_COUPON_USAGE', 'Coupon is not valid for these products')
  const eligibleSubtotalMinor = eligibleItems.reduce((total, item) => total + item.subtotalMinor, 0)
  if (eligibleSubtotalMinor < (coupon.minimumOrderMinor ?? 0))
    throw new AppError(400, 'COUPON_MINIMUM_NOT_MET', 'Minimum order amount is not met')
  const rawDiscount =
    coupon.discountType === 'percentage'
      ? Math.floor((eligibleSubtotalMinor * coupon.discountValue) / 100)
      : coupon.discountValue
  const discountMinor = Math.min(
    rawDiscount,
    coupon.maximumDiscountMinor ?? rawDiscount,
    eligibleSubtotalMinor,
  )
  const priorUsage = await CouponRedemption.countDocuments({
    couponId: coupon._id,
    userId: customerId,
    status: { $in: ['reserved', 'applied'] },
  }).session(session)
  if (coupon.perUserUsageLimit !== undefined && priorUsage >= coupon.perUserUsageLimit)
    throw new AppError(
      409,
      'PER_USER_USAGE_LIMIT_REACHED',
      'Coupon usage limit reached for this customer',
    )
  return { coupon, discountMinor }
}

export async function reserveCoupon(couponId, userId, orderId, discountMinor, session) {
  const coupon = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      status: 'active',
      $or: [{ usageLimit: { $exists: false } }, { $expr: { $lt: ['$usageCount', '$usageLimit'] } }],
    },
    { $inc: { usageCount: 1 } },
    { new: true, session },
  )
  if (!coupon) throw new AppError(409, 'USAGE_LIMIT_REACHED', 'Coupon usage limit reached')
  const [redemption] = await CouponRedemption.create(
    [{ couponId, userId, orderId, discountMinor, status: 'reserved' }],
    { session },
  )
  return redemption
}

export async function applyRedemption(orderId, session) {
  await CouponRedemption.updateMany(
    { orderId, status: 'reserved' },
    { $set: { status: 'applied' } },
    { session },
  )
}

export async function releaseRedemptions(orderId, session) {
  const redemptions = await CouponRedemption.find({ orderId, status: 'reserved' }).session(session)
  for (const redemption of redemptions) {
    await Coupon.findOneAndUpdate(
      { _id: redemption.couponId, usageCount: { $gt: 0 } },
      { $inc: { usageCount: -1 } },
      { session },
    )
    redemption.status = 'released'
    redemption.releasedAt = new Date()
    await redemption.save({ session })
  }
}

export async function validateCartCoupon(userId, code) {
  const { Cart } = await import('../models/Cart.js')
  const { Product } = await import('../models/Product.js')
  const { ProductVariant } = await import('../models/ProductVariant.js')
  const { Seller } = await import('../models/Seller.js')
  const cart = await Cart.findOne({ userId }).lean()
  if (!cart || !cart.items.length)
    throw new AppError(409, 'CART_EMPTY', 'Cannot validate a coupon against an empty cart')
  const items = []
  for (const item of cart.items) {
    const [product, variant, seller] = await Promise.all([
      Product.findOne({ _id: item.productId, status: 'active' }).lean(),
      ProductVariant.findOne({
        _id: item.variantId,
        productId: item.productId,
        status: 'active',
      }).lean(),
      Seller.findOne({ _id: item.sellerId, status: 'approved' }).lean(),
    ])
    if (product && variant && seller)
      items.push({ seller, subtotalMinor: variant.currentPriceMinor * item.quantity })
  }
  const result = await calculateCoupon(code, userId, items, cart.currency)
  return { code: result.coupon.code, discountMinor: result.discountMinor, currency: cart.currency }
}
