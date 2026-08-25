import { Router } from 'express'
import { answer, ask, productQuestions, sellerQuestions } from '../controllers/qaController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateAnswer, validateQuestion } from '../middleware/qaValidation.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.get('/products/:productId/questions', asyncHandler(productQuestions))
router.post(
  '/products/:productId/questions',
  authenticate,
  authorize('customer'),
  validateQuestion,
  asyncHandler(ask),
)
router.post(
  '/questions/:questionId/answers',
  authenticate,
  authorize('seller'),
  validateAnswer,
  asyncHandler(answer),
)
router.get('/seller/questions', authenticate, authorize('seller'), asyncHandler(sellerQuestions))

export default router
