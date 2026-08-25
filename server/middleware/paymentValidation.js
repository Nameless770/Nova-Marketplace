import mongoose from 'mongoose'
import { AppError } from '../utils/errors.js'

export function validateOrderId(request, _response, next) {
  if (!mongoose.isValidObjectId(request.params.orderId))
    return next(new AppError(404, 'ORDER_NOT_FOUND', 'Order not found'))
  next()
}

export function requireIdempotencyKey(request, _response, next) {
  if (!request.get('Idempotency-Key') || request.get('Idempotency-Key').length > 160)
    return next(
      new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required'),
    )
  next()
}
