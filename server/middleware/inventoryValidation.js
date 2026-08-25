import { AppError } from '../utils/errors.js'

export function validateInventoryCommand(request, _response, next) {
  const { quantity, commandId, reason, lowStockThreshold } = request.body ?? {}
  const errors = []
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    errors.push('quantity must be a positive integer')
  if (typeof commandId !== 'string' || commandId.trim().length < 8 || commandId.length > 120)
    errors.push('commandId must be 8 to 120 characters')
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 300))
    errors.push('reason must be at most 300 characters')
  if (
    lowStockThreshold !== undefined &&
    (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0)
  )
    errors.push('lowStockThreshold must be a non-negative integer')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateReservation(request, _response, next) {
  const { quantity, reservationKey, expiresAt, commandId } = request.body ?? {}
  const errors = []
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    errors.push('quantity must be a positive integer')
  if (
    typeof reservationKey !== 'string' ||
    reservationKey.trim().length < 8 ||
    reservationKey.length > 160
  )
    errors.push('reservationKey must be 8 to 160 characters')
  if (typeof commandId !== 'string' || commandId.trim().length < 8 || commandId.length > 120)
    errors.push('commandId must be 8 to 120 characters')
  if (expiresAt !== undefined && Number.isNaN(Date.parse(expiresAt)))
    errors.push('expiresAt must be a valid date')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateReservationFinalization(request, _response, next) {
  const { reservationKey, commandId } = request.body ?? {}
  if (
    typeof reservationKey !== 'string' ||
    reservationKey.trim().length < 8 ||
    reservationKey.length > 160
  ) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'reservationKey must be 8 to 160 characters'))
  }
  if (typeof commandId !== 'string' || commandId.trim().length < 8 || commandId.length > 120) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'commandId must be 8 to 120 characters'))
  }
  next()
}
