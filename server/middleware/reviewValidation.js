import { AppError } from '../utils/errors.js'

export function validateReview(request, _response, next) {
  const { rating, text, title, images } = request.body ?? {}
  const errors = []
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    errors.push('rating must be an integer from 1 to 5')
  if (typeof text !== 'string' || text.trim().length < 1 || text.trim().length > 5000)
    errors.push('text must be 1 to 5000 characters')
  if (title !== undefined && (typeof title !== 'string' || title.trim().length > 160))
    errors.push('title must be at most 160 characters')
  if (
    images !== undefined &&
    (!Array.isArray(images) ||
      images.length > 6 ||
      images.some((image) => !image || typeof image.url !== 'string' || image.url.length > 2048))
  )
    errors.push('images must contain at most 6 valid image references')
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateReviewStatus(request, _response, next) {
  const { status, reason } = request.body ?? {}
  if (!['published', 'rejected', 'removed', 'pending'].includes(status))
    return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid review status'))
  if (['rejected', 'removed'].includes(status) && (typeof reason !== 'string' || !reason.trim()))
    return next(new AppError(400, 'VALIDATION_ERROR', 'A moderation reason is required'))
  next()
}
