import { AppError } from '../utils/errors.js'

export function validateUserStatus(request, _response, next) {
  if (!['active', 'suspended'].includes(request.body?.status))
    return next(new AppError(400, 'VALIDATION_ERROR', 'status must be active or suspended'))
  next()
}

export function validateCouponStatus(request, _response, next) {
  if (!['active', 'inactive'].includes(request.body?.status))
    return next(new AppError(400, 'VALIDATION_ERROR', 'status must be active or inactive'))
  next()
}

export function validateCategoryUpdate(request, _response, next) {
  const { name, description, status, sortOrder } = request.body ?? {}
  const errors = []

  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100))
    errors.push('name must be 1 to 100 characters')
  if (description !== undefined && (typeof description !== 'string' || description.length > 1000))
    errors.push('description must be at most 1000 characters')
  if (status !== undefined && !['active', 'inactive', 'removed'].includes(status))
    errors.push('status must be active, inactive or removed')
  if (sortOrder !== undefined && (!Number.isSafeInteger(sortOrder) || sortOrder < 0))
    errors.push('sortOrder must be a non-negative integer')
  if (name === undefined && description === undefined && status === undefined && sortOrder === undefined)
    errors.push('at least one field is required')

  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}
