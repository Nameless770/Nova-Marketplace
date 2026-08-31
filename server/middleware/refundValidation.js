import { AppError } from '../utils/errors.js'

export function validateRefund(request, _response, next) {
  const { amountMinor, reason, restock, items } = request.body ?? {}
  const errors = []

  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1)
    errors.push('amountMinor must be a positive integer in minor units')
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500)
    errors.push('reason must be 1 to 500 characters')
  if (restock !== undefined && typeof restock !== 'boolean') errors.push('restock must be boolean')

  if (items !== undefined) {
    if (!Array.isArray(items) || items.length > 100) {
      errors.push('items must be an array of at most 100 entries')
    } else {
      for (const item of items) {
        if (!item || typeof item !== 'object') {
          errors.push('each item must be an object')
          break
        }
        if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
          errors.push('each item requires a positive integer quantity')
          break
        }
      }
    }
  }

  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}
