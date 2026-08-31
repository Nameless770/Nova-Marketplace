import { Router } from 'express'
import { adminAssistant, search, shoppingAssistant } from '../controllers/aiController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import {
  aiRateLimit,
  requireAiConfigured,
  validateAdminQuestion,
  validateAssistantQuery,
  validateSearchQuery,
} from '../middleware/aiValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

// Public: shoppers search before signing in. Deliberately no requireAiConfigured
// — this route degrades to plain text search rather than failing when the model
// is unavailable, so search never depends on the AI being up.
router.post(
  '/search',
  aiRateLimit({ authenticated: 20, anonymous: 6 }),
  validateSearchQuery,
  asyncHandler(search),
)

router.post(
  '/admin-assistant',
  authenticate,
  authorize('admin'),
  requireAiConfigured,
  aiRateLimit({ authenticated: 15 }),
  validateAdminQuestion,
  asyncHandler(adminAssistant),
)

router.post(
  '/shopping-assistant',
  authenticate,
  authorize('customer'),
  requireAiConfigured,
  aiRateLimit({ authenticated: 10 }),
  validateAssistantQuery,
  asyncHandler(shoppingAssistant),
)

export default router
