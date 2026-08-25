import { AppError } from '../utils/errors.js'

function requireString(value, field, { min = 1, max = 120 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    return `${field} must be ${min === max ? `exactly ${min}` : `${min} to ${max}`} characters`
  }
  return null
}

export function validateProfileUpdate(request, _response, next) {
  const { firstName, lastName, phone } = request.body ?? {}
  const errors = []
  if (firstName !== undefined) errors.push(requireString(firstName, 'firstName', { max: 80 }))
  if (lastName !== undefined) errors.push(requireString(lastName, 'lastName', { max: 80 }))
  if (phone !== undefined && (typeof phone !== 'string' || phone.trim().length > 32)) {
    errors.push('phone must be at most 32 characters')
  }
  if (firstName === undefined && lastName === undefined && phone === undefined) {
    errors.push('at least one profile field is required')
  }
  const messages = errors.filter(Boolean)
  if (messages.length) return next(new AppError(400, 'VALIDATION_ERROR', messages.join('; ')))
  next()
}

export function validatePasswordChange(request, _response, next) {
  const { currentPassword, newPassword } = request.body ?? {}
  const errors = []
  if (typeof currentPassword !== 'string' || currentPassword.length === 0)
    errors.push('currentPassword is required')
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    errors.push('newPassword must be 8 to 128 characters')
  }
  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.push('newPassword must differ from currentPassword')
  }
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateAddress(request, _response, next) {
  const address = request.body ?? {}
  const fields = ['firstName', 'lastName', 'line1', 'city', 'state', 'postalCode', 'country']
  const errors = fields.map((field) => requireString(address[field], field)).filter(Boolean)
  if (address.country && !/^[a-z]{2}$/i.test(address.country))
    errors.push('country must be a 2-letter ISO code')
  if (address.isDefault !== undefined && typeof address.isDefault !== 'boolean')
    errors.push('isDefault must be boolean')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateAccountDeletion(request, _response, next) {
  if (typeof request.body?.currentPassword !== 'string' || !request.body.currentPassword) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'currentPassword is required'))
  }
  next()
}

export function validateAccountUpdate(request, _response, next) {
  const { email, currentPassword } = request.body ?? {}
  const errors = []
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email))
    errors.push('valid email is required')
  if (typeof currentPassword !== 'string' || !currentPassword)
    errors.push('currentPassword is required')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}
