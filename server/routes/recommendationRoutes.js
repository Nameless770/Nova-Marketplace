import { Router } from 'express'
import { forYou, recentlyViewed, similar } from '../controllers/recommendationController.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

// Similarity is a property of the catalogue, not of the shopper, so it stays public.
router.get('/products/:productId/similar', asyncHandler(similar))

router.get('/for-you', authenticate, asyncHandler(forYou))
router.get('/recently-viewed', authenticate, asyncHandler(recentlyViewed))

export default router
