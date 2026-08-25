import { Router } from 'express'
import {
  createPlatformCoupon,
  createSellerCoupon,
  platformCoupons,
  sellerCoupons,
  validate,
} from '../controllers/couponController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateCoupon, validateCouponCode } from '../middleware/couponValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.post(
  '/validate',
  authenticate,
  authorize('customer'),
  validateCouponCode,
  asyncHandler(validate),
)
router.get('/seller', authenticate, authorize('seller'), asyncHandler(sellerCoupons))
router.post(
  '/seller',
  authenticate,
  authorize('seller'),
  validateCoupon,
  asyncHandler(createSellerCoupon),
)
router.get('/admin', authenticate, authorize('admin'), asyncHandler(platformCoupons))
router.post(
  '/admin',
  authenticate,
  authorize('admin'),
  validateCoupon,
  asyncHandler(createPlatformCoupon),
)

export default router
