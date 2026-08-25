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

export default router
