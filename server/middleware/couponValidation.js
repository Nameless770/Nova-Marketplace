import { AppError } from '../utils/errors.js'

export function validateCoupon(request, _response, next) {
  const coupon = request.body ?? {}
  const errors = []
  if (
    typeof coupon.code !== 'string' ||
    coupon.code.trim().length < 2 ||
    coupon.code.trim().length > 40
  )
    errors.push('code must be 2 to 40 characters')
  if (!['percentage', 'fixed'].includes(coupon.discountType))
    errors.push('discountType must be percentage or fixed')
  if (!Number.isSafeInteger(coupon.discountValue) || coupon.discountValue <= 0)
    errors.push('discountValue must be a positive integer')
  if (coupon.discountType === 'percentage' && coupon.discountValue > 100)
    errors.push('percentage discount cannot exceed 100')
  if (
    coupon.maximumDiscountMinor !== undefined &&
    (!Number.isSafeInteger(coupon.maximumDiscountMinor) || coupon.maximumDiscountMinor < 0)
  )
    errors.push('maximumDiscountMinor must be non-negative')
  if (
    coupon.minimumOrderMinor !== undefined &&
    (!Number.isSafeInteger(coupon.minimumOrderMinor) || coupon.minimumOrderMinor < 0)
  )
    errors.push('minimumOrderMinor must be non-negative')
  if (!coupon.expiresAt || Number.isNaN(Date.parse(coupon.expiresAt)))
    errors.push('expiresAt must be a valid date')
  if (
    coupon.usageLimit !== undefined &&
    (!Number.isSafeInteger(coupon.usageLimit) || coupon.usageLimit < 1)
  )
    errors.push('usageLimit must be positive')
  if (
    coupon.perUserUsageLimit !== undefined &&
    (!Number.isSafeInteger(coupon.perUserUsageLimit) || coupon.perUserUsageLimit < 1)
  )
    errors.push('perUserUsageLimit must be positive')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateCouponCode(request, _response, next) {
  if (typeof request.body?.code !== 'string' || request.body.code.trim().length < 2)
    return next(new AppError(400, 'VALIDATION_ERROR', 'Valid coupon code is required'))
  next()
}
