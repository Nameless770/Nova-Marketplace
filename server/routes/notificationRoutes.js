import { Router } from 'express'
import { markAllRead, markRead, notifications } from '../controllers/notificationController.js'
import { authenticate } from '../middleware/auth.js'
import { validateNotificationId } from '../middleware/notificationValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()
router.use(authenticate)
router.get('/', asyncHandler(notifications))
router.patch('/:notificationId/read', validateNotificationId, asyncHandler(markRead))
router.post('/read-all', asyncHandler(markAllRead))
export default router
