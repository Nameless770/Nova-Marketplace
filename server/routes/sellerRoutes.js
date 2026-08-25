import { Router } from 'express'
import {
  analytics,
  createApplication,
  dashboard,
  myApplication,
  mySeller,
  orders,
  products,
  updateSeller,
} from '../controllers/sellerController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateSellerApplication, validateStoreUpdate } from '../middleware/sellerValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.use(authenticate)
router.post(
  '/applications',
  authorize('customer'),
  validateSellerApplication,
  asyncHandler(createApplication),
)
router.get('/applications/me', asyncHandler(myApplication))
router.get('/me', authorize('seller'), asyncHandler(mySeller))
router.patch('/me', authorize('seller'), validateStoreUpdate, asyncHandler(updateSeller))
router.get('/dashboard', authorize('seller'), asyncHandler(dashboard))
router.get('/products', authorize('seller'), asyncHandler(products))
router.get('/orders', authorize('seller'), asyncHandler(orders))
router.get('/analytics', authorize('seller'), asyncHandler(analytics))

export default router
