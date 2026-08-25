import { Router } from 'express'
import {
  create,
  customerOrder,
  customerOrders,
  sellerOrder,
  sellerOrderStatus,
  sellerOrders,
} from '../controllers/orderController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateCreateOrder, validateSellerOrderStatus } from '../middleware/orderValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.use(authenticate)
router.post('/', authorize('customer'), validateCreateOrder, asyncHandler(create))
router.get('/', authorize('customer'), asyncHandler(customerOrders))
router.get('/seller/list', authorize('seller'), asyncHandler(sellerOrders))
router.get('/seller/:sellerOrderId', authorize('seller'), asyncHandler(sellerOrder))
router.patch(
  '/seller/:sellerOrderId/status',
  authorize('seller'),
  validateSellerOrderStatus,
  asyncHandler(sellerOrderStatus),
)
router.get('/:orderId', authorize('customer'), asyncHandler(customerOrder))

export default router
