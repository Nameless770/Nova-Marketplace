import { Router } from 'express'
import { checkoutSession, paymentStatus } from '../controllers/paymentController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { requireIdempotencyKey, validateOrderId } from '../middleware/paymentValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.use(authenticate, authorize('customer'))
router.post(
  '/orders/:orderId/checkout-session',
  validateOrderId,
  requireIdempotencyKey,
  asyncHandler(checkoutSession),
)
router.get('/orders/:orderId', validateOrderId, asyncHandler(paymentStatus))

export default router
