import { AppError } from '../utils/errors.js'

export function validateAuthBody(request, _response, next) {
  const { email, password, firstName, lastName } = request.body ?? {}
  const errors = []

  if (request.path === '/register') {
    if (typeof firstName !== 'string' || firstName.trim().length < 1)
      errors.push('firstName is required')
    if (typeof lastName !== 'string' || lastName.trim().length < 1)
      errors.push('lastName is required')
  }
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email))
    errors.push('valid email is required')
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    errors.push('password must be 8 to 128 characters')
  }

  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}
