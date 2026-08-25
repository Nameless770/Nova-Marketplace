import { AppError } from '../utils/errors.js'

const emailPattern = /^\S+@\S+\.\S+$/

export function validateSellerApplication(request, _response, next) {
  const { storeName, legalName, country, contactEmail } = request.body ?? {}
  const errors = []
  if (typeof storeName !== 'string' || storeName.trim().length < 2 || storeName.trim().length > 120)
    errors.push('storeName must be 2 to 120 characters')
  if (typeof legalName !== 'string' || legalName.trim().length < 2 || legalName.trim().length > 160)
    errors.push('legalName must be 2 to 160 characters')
  if (typeof country !== 'string' || !/^[a-z]{2}$/i.test(country))
    errors.push('country must be a 2-letter ISO code')
  if (typeof contactEmail !== 'string' || !emailPattern.test(contactEmail))
    errors.push('valid contactEmail is required')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateStoreUpdate(request, _response, next) {
  const { storeName, description, image } = request.body ?? {}
  const errors = []
  if (
    storeName !== undefined &&
    (typeof storeName !== 'string' || storeName.trim().length < 2 || storeName.trim().length > 120)
  )
    errors.push('storeName must be 2 to 120 characters')
  if (
    description !== undefined &&
    (typeof description !== 'string' || description.trim().length > 2000)
  )
    errors.push('description must be at most 2000 characters')
  if (
    image !== undefined &&
    (typeof image !== 'object' ||
      image === null ||
      typeof image.url !== 'string' ||
      image.url.length > 2048)
  )
    errors.push('image.url is required and must be at most 2048 characters')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateSellerDecision(request, _response, next) {
  const { status, reason } = request.body ?? {}
  if (!['approved', 'rejected', 'suspended', 'pending'].includes(status))
    return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid seller status'))
  if (['rejected', 'suspended'].includes(status) && (typeof reason !== 'string' || !reason.trim()))
    return next(new AppError(400, 'VALIDATION_ERROR', 'A reason is required'))
  next()
}
