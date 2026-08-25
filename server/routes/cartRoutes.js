import { Router } from 'express'
import { addItem, currentCart, emptyCart, removeItem, updateItem } from '../controllers/cartController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateCartItem, validateQuantity } from '../middleware/cartValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.use(authenticate, authorize('customer'))
router.get('/', asyncHandler(currentCart))
router.post('/items', validateCartItem, asyncHandler(addItem))
router.patch('/items/:itemId', validateQuantity, asyncHandler(updateItem))
router.delete('/items/:itemId', asyncHandler(removeItem))
router.delete('/', asyncHandler(emptyCart))

export default router