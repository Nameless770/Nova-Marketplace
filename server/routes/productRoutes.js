import { Router } from 'express'
import {
  createSellerProduct,
  createSellerVariant,
  product,
  products,
  removeSellerProduct,
  removeSellerVariant,
  sellerProduct,
  sellerProducts,
  submitSellerProduct,
  updateSellerProduct,
  updateSellerVariant,
} from '../controllers/productController.js'
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth.js'
import { validateProduct, validateVariant } from '../middleware/productValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()
const sellerAccess = [authenticate, authorize('seller')]

router.get('/seller', sellerAccess, asyncHandler(sellerProducts))
// A seller's own product at any status — the public route only serves active ones.
router.get('/seller/:productId', sellerAccess, asyncHandler(sellerProduct))
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
// Optional auth so a signed-in shopper's views feed recommendations, while the
// route stays public for everyone else.
router.get('/:productId', optionalAuthenticate, asyncHandler(product))

export default router
