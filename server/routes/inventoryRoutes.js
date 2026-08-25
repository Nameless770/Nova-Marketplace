import { Router } from 'express'
import {
  add,
  confirm,
  history,
  initialize,
  list,
  release,
  remove,
  reserve,
} from '../controllers/inventoryController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import {
  validateInventoryCommand,
  validateReservation,
  validateReservationFinalization,
} from '../middleware/inventoryValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()
const sellerAccess = [authenticate, authorize('seller')]

router.get('/', sellerAccess, asyncHandler(list))
router.post('/variants/:variantId', sellerAccess, asyncHandler(initialize))
router.get('/variants/:variantId/history', sellerAccess, asyncHandler(history))
router.post('/variants/:variantId/add', sellerAccess, validateInventoryCommand, asyncHandler(add))
router.post(
  '/variants/:variantId/remove',
  sellerAccess,
  validateInventoryCommand,
  asyncHandler(remove),
)
router.post(
  '/variants/:variantId/reserve',
  sellerAccess,
  validateReservation,
  asyncHandler(reserve),
)
router.post(
  '/reservations/release',
  sellerAccess,
  validateReservationFinalization,
  asyncHandler(release),
)
router.post(
  '/reservations/confirm',
  sellerAccess,
  validateReservationFinalization,
  asyncHandler(confirm),
)

export default router
