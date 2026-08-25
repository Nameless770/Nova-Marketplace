import { Router } from 'express'
import { addItem, currentWishlist, removeItem } from '../controllers/wishlistController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateWishlistItem } from '../middleware/wishlistValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.use(authenticate, authorize('customer'))
router.get('/', asyncHandler(currentWishlist))
router.post('/items', validateWishlistItem, asyncHandler(addItem))
router.delete('/items/:itemId', asyncHandler(removeItem))

export default router
