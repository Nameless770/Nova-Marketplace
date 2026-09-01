import { AppError } from '../utils/errors.js'
import { IMAGE_URL_MESSAGE, isSafeImageUrl } from '../utils/url.js'

const bodyString = (value, field, min, max) =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
    ? null
    : `${field} must be ${min} to ${max} characters`

export function validateProduct(request, _response, next) {
  const product = request.body ?? {}
  const errors = [
    bodyString(product.title, 'title', 2, 180),
    bodyString(product.description, 'description', 2, 10000),
    bodyString(product.brand ?? '', 'brand', 0, 120),
  ]
  if (
    !Array.isArray(product.categoryIds) ||
    product.categoryIds.length < 1 ||
    product.categoryIds.length > 5
  )
    errors.push('categoryIds must contain 1 to 5 IDs')
  if (!Array.isArray(product.images) || product.images.length < 1 || product.images.length > 12) {
    errors.push('images must contain 1 to 12 images')
  } else if (!product.images.every((image) => isSafeImageUrl(image?.url))) {
    // Sellers supply these and every shopper renders them, so a `javascript:` or
    // `data:` URL here would be stored XSS.
    errors.push(`every image url ${IMAGE_URL_MESSAGE}`)
  }
  if (typeof product.hasVariants !== 'boolean') errors.push('hasVariants must be boolean')
  if (!product.hasVariants && (!Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0))
    errors.push('priceMinor must be a non-negative integer')
  if (
    product.discountPercent !== undefined &&
    (typeof product.discountPercent !== 'number' ||
      product.discountPercent < 0 ||
      product.discountPercent > 100)
  )
    errors.push('discountPercent must be between 0 and 100')
  if (errors.filter(Boolean).length)
    return next(new AppError(400, 'VALIDATION_ERROR', errors.filter(Boolean).join('; ')))
  next()
}

export function validateVariant(request, _response, next) {
  const variant = request.body ?? {}
  const errors = [bodyString(variant.sku, 'sku', 1, 80), bodyString(variant.name, 'name', 1, 120)]
  if (!Number.isSafeInteger(variant.priceMinor) || variant.priceMinor < 0)
    errors.push('priceMinor must be a non-negative integer')
  if (
    variant.discountPercent !== undefined &&
    (typeof variant.discountPercent !== 'number' ||
      variant.discountPercent < 0 ||
      variant.discountPercent > 100)
  )
    errors.push('discountPercent must be between 0 and 100')
  if (errors.filter(Boolean).length)
    return next(new AppError(400, 'VALIDATION_ERROR', errors.filter(Boolean).join('; ')))
  next()
}

export function validateProductStatus(request, _response, next) {
  if (!['active', 'rejected', 'removed', 'pending_review'].includes(request.body?.status))
    return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid product status'))
  next()
}
