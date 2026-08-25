import { Router } from 'express'
import {
  createSellerProduct,
  createSellerVariant,
  product,
  products,
  removeSellerProduct,
  removeSellerVariant,
  sellerProducts,
  submitSellerProduct,
  updateSellerProduct,
  updateSellerVariant,
} from '../controllers/productController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateProduct, validateVariant } from '../middleware/productValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()
const sellerAccess = [authenticate, authorize('seller')]

router.get('/seller', sellerAccess, asyncHandler(sellerProducts))
router.post('/seller', sellerAccess, validateProduct, asyncHandler(createSellerProduct))
router.patch('/seller/:productId', sellerAccess, asyncHandler(updateSellerProduct))
router.delete('/seller/:productId', sellerAccess, asyncHandler(removeSellerProduct))
router.post('/seller/:productId/submit', sellerAccess, asyncHandler(submitSellerProduct))
router.post(
  '/seller/:productId/variants',
  sellerAccess,
  validateVariant,
  asyncHandler(createSellerVariant),
)
router.patch(
  '/seller/:productId/variants/:variantId',
  sellerAccess,
  asyncHandler(updateSellerVariant),
)
router.delete(
  '/seller/:productId/variants/:variantId',
  sellerAccess,
  asyncHandler(removeSellerVariant),
)
router.get('/', asyncHandler(products))
router.get('/:productId', asyncHandler(product))

export default router
