import { Router } from 'express'
import { currentUser, login, logout, register } from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'
import { credentialGuard, rateLimit } from '../middleware/rateLimit.js'
import { validateAuthBody } from '../middleware/validate.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

// Registration is throttled per IP; login additionally locks an account after
// repeated failures so a single password cannot be guessed at speed.
router.post(
  '/register',
  rateLimit({ max: 10, windowMs: 60 * 60_000, message: 'Too many sign-up attempts' }),
  validateAuthBody,
  asyncHandler(register),
)
router.post('/login', credentialGuard(), validateAuthBody, asyncHandler(login))
router.post('/logout', authenticate, asyncHandler(logout))
router.get('/me', authenticate, asyncHandler(currentUser))

export default router
