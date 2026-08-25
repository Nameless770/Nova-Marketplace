import { Router } from 'express'
import {
  createCurrentAddress,
  deleteCurrentAccount,
  deleteCurrentAddress,
  currentUser,
  updateCurrentAccount,
  updateCurrentAddress,
  updateCurrentPassword,
  updateCurrentProfile,
} from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'
import {
  validateAccountDeletion,
  validateAccountUpdate,
  validateAddress,
  validatePasswordChange,
  validateProfileUpdate,
} from '../middleware/accountValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.use(authenticate)
router.get('/me', asyncHandler(currentUser))
router.patch('/me', validateProfileUpdate, asyncHandler(updateCurrentProfile))
router.patch('/me/account', validateAccountUpdate, asyncHandler(updateCurrentAccount))
router.patch('/me/password', validatePasswordChange, asyncHandler(updateCurrentPassword))
router.post('/me/addresses', validateAddress, asyncHandler(createCurrentAddress))
router.patch('/me/addresses/:addressId', validateAddress, asyncHandler(updateCurrentAddress))
router.delete('/me/addresses/:addressId', asyncHandler(deleteCurrentAddress))
router.delete('/me', validateAccountDeletion, asyncHandler(deleteCurrentAccount))

export default router
