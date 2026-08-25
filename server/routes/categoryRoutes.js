import { Router } from 'express'
import {
  category,
  categories,
  categoryProducts,
  createCategoryController,
} from '../controllers/productController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { asyncHandler } from '../utils/errors.js'

const router = Router()

router.get('/', asyncHandler(categories))
router.get('/:categoryId/products', asyncHandler(categoryProducts))
router.get('/:categoryId', asyncHandler(category))
router.post('/', authenticate, authorize('admin'), asyncHandler(createCategoryController))

export default router
