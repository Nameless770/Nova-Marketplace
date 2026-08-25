import mongoose from 'mongoose'
import { AppError } from '../utils/errors.js'

export function validateCartItem(request, _response, next) {
  const { productId, variantId, quantity } = request.body ?? {}
  const errors = []
  if (!mongoose.isValidObjectId(productId)) errors.push('valid productId is required')
  if (!mongoose.isValidObjectId(variantId)) errors.push('valid variantId is required')
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999)
    errors.push('quantity must be an integer from 1 to 999')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateQuantity(request, _response, next) {
  if (
    !Number.isSafeInteger(request.body?.quantity) ||
    request.body.quantity < 1 ||
    request.body.quantity > 999
  ) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'quantity must be an integer from 1 to 999'))
  }
  next()
}
