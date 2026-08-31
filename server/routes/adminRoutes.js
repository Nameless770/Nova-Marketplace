import { Router } from 'express'
import { moderate as moderateSeller } from '../controllers/sellerController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateSellerDecision } from '../middleware/sellerValidation.js'
import { asyncHandler } from '../utils/errors.js'
import {
  moderate as moderateProduct,
  removeAdminProduct,
} from '../controllers/productController.js'
import { validateProductStatus } from '../middleware/productValidation.js'
import { moderate as moderateReview } from '../controllers/reviewController.js'
import { validateReviewStatus } from '../middleware/reviewValidation.js'
import {
  adminAnswers,
  adminQuestions,
  moderateAnswer,
  moderateQuestion,
} from '../controllers/qaController.js'
import { validateModeration } from '../middleware/qaValidation.js'
import {
  categories as adminCategories,
  coupons as adminCoupons,
  couponStatus,
  inventory as adminInventory,
  orders as adminOrders,
  overview,
  products as adminProductList,
  reviews as adminReviewList,
  sellers as adminSellers,
  updateCategory,
  userStatus,
  users as adminUsers,
} from '../controllers/adminController.js'
import {
  validateCategoryUpdate,
  validateCouponStatus,
  validateUserStatus,
} from '../middleware/adminValidation.js'

const router = Router()

router.use(authenticate, authorize('admin'))

router.get('/overview', asyncHandler(overview))
router.get('/users', asyncHandler(adminUsers))
router.patch('/users/:userId/status', validateUserStatus, asyncHandler(userStatus))
router.get('/orders', asyncHandler(adminOrders))
router.get('/inventory', asyncHandler(adminInventory))
router.get('/categories', asyncHandler(adminCategories))
router.patch('/categories/:categoryId', validateCategoryUpdate, asyncHandler(updateCategory))
router.get('/coupons', asyncHandler(adminCoupons))
router.patch('/coupons/:couponId/status', validateCouponStatus, asyncHandler(couponStatus))
router.get('/sellers', asyncHandler(adminSellers))
router.patch('/sellers/:sellerId/status', validateSellerDecision, asyncHandler(moderateSeller))
router.patch('/products/:productId/status', validateProductStatus, asyncHandler(moderateProduct))
router.get('/products', asyncHandler(adminProductList))
router.delete('/products/:productId', asyncHandler(removeAdminProduct))
router.get('/reviews', asyncHandler(adminReviewList))
router.patch('/reviews/:reviewId/status', validateReviewStatus, asyncHandler(moderateReview))
router.get('/questions', asyncHandler(adminQuestions))
router.patch('/questions/:questionId/status', validateModeration, asyncHandler(moderateQuestion))
router.get('/answers', asyncHandler(adminAnswers))
router.patch('/answers/:answerId/status', validateModeration, asyncHandler(moderateAnswer))

export default router
