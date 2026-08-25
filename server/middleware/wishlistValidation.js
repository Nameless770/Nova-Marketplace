import mongoose from 'mongoose'
import { AppError } from '../utils/errors.js'

export function validateWishlistItem(request, _response, next) {
  const { productId, variantId } = request.body ?? {}
  if (!mongoose.isValidObjectId(productId)) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'valid productId is required'))
  }
  if (variantId !== undefined && !mongoose.isValidObjectId(variantId)) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'variantId must be valid'))
  }
  next()
}
