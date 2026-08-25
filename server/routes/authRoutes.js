import { Router } from 'express'
import { currentUser, login, logout, register } from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'
import { validateAuthBody } from '../middleware/validate.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.post('/register', validateAuthBody, asyncHandler(register))
router.post('/login', validateAuthBody, asyncHandler(login))
router.post('/logout', authenticate, asyncHandler(logout))
router.get('/me', authenticate, asyncHandler(currentUser))

export default router
