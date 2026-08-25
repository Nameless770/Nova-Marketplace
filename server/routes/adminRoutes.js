import { Router } from 'express'
import { moderate as moderateSeller } from '../controllers/sellerController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateSellerDecision } from '../middleware/sellerValidation.js'
import { asyncHandler } from '../utils/errors.js'
import { Seller } from '../models/Seller.js'
import {
  adminProducts,
  moderate as moderateProduct,
  removeAdminProduct,
} from '../controllers/productController.js'
import { validateProductStatus } from '../middleware/productValidation.js'
import { moderationReviews, moderate as moderateReview } from '../controllers/reviewController.js'
import { validateReviewStatus } from '../middleware/reviewValidation.js'
import {
  adminAnswers,
  adminQuestions,
  moderateAnswer,
  moderateQuestion,
} from '../controllers/qaController.js'
import { validateModeration } from '../middleware/qaValidation.js'

const router = Router()

router.use(authenticate, authorize('admin'))
router.get(
  '/sellers',
  asyncHandler(async (request, response) => {
    const limit = Math.min(Number(request.query.limit) || 25, 100)
    const filter = request.query.status ? { status: request.query.status } : {}
    const sellers = await Seller.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean()
    response.json({ success: true, data: { sellers, meta: { nextCursor: null, hasMore: false } } })
  }),
)
router.patch('/sellers/:sellerId/status', validateSellerDecision, asyncHandler(moderateSeller))
router.patch('/products/:productId/status', validateProductStatus, asyncHandler(moderateProduct))
router.get('/products', asyncHandler(adminProducts))
router.delete('/products/:productId', asyncHandler(removeAdminProduct))
router.get('/reviews', asyncHandler(moderationReviews))
router.patch('/reviews/:reviewId/status', validateReviewStatus, asyncHandler(moderateReview))
router.get('/questions', asyncHandler(adminQuestions))
router.patch('/questions/:questionId/status', validateModeration, asyncHandler(moderateQuestion))
router.get('/answers', asyncHandler(adminAnswers))
router.patch('/answers/:answerId/status', validateModeration, asyncHandler(moderateAnswer))

export default router
