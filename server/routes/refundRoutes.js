import { Router } from 'express'
import { create, forOrder, refundable } from '../controllers/refundController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { requireIdempotencyKey } from '../middleware/paymentValidation.js'
import { validateRefund } from '../middleware/refundValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.use(authenticate)

// Admins may refund any order; sellers only their own SellerOrder portion.
// The service re-derives the scope from the authenticated user either way.
router.post(
  '/orders/:orderId',
  authorize('admin', 'seller'),
  requireIdempotencyKey,
  validateRefund,
  asyncHandler(create),
)
router.get('/orders/:orderId/refundable', authorize('admin', 'seller'), asyncHandler(refundable))
router.get('/orders/:orderId', authorize('admin', 'seller', 'customer'), asyncHandler(forOrder))

export default router
