import { Router } from 'express'
import {
  createCustomerReview,
  deleteCustomerReview,
  productReviews,
  updateCustomerReview,
} from '../controllers/reviewController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateReview } from '../middleware/reviewValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.get('/products/:productId', asyncHandler(productReviews))
router.post(
  '/products/:productId',
  authenticate,
  authorize('customer'),
  validateReview,
  asyncHandler(createCustomerReview),
)
router.patch(
  '/:reviewId',
  authenticate,
  authorize('customer'),
  validateReview,
  asyncHandler(updateCustomerReview),
)
router.delete('/:reviewId', authenticate, authorize('customer'), asyncHandler(deleteCustomerReview))

export default router
