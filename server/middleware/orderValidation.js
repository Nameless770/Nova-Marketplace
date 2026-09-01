import { AppError } from '../utils/errors.js'

// Checkout captures a map pin instead of a typed address, so the delivery point
// is what must be present: a pair of coordinates, or a resolved line1 for an
// address supplied some other way. Everything else is optional and only checked
// for shape when it is provided.
function validCoordinate(value, limit) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
}

function validateAddress(address, name) {
  if (!address || typeof address !== 'object') return `${name} is required`

  const hasPoint = validCoordinate(address.latitude, 90) && validCoordinate(address.longitude, 180)
  const hasLine = typeof address.line1 === 'string' && address.line1.trim().length > 0
  if (!hasPoint && !hasLine) return `${name} needs a delivery location`

  if (address.country !== undefined && !/^[a-z]{2}$/i.test(address.country))
    return `${name}.country must be a 2-letter ISO code`
  return null
}

export function validateCreateOrder(request, _response, next) {
  const errors = [
    validateAddress(request.body?.shippingAddress, 'shippingAddress'),
    validateAddress(
      request.body?.billingAddress ?? request.body?.shippingAddress,
      'billingAddress',
    ),
  ].filter(Boolean)
  if (errors.length) return next(new AppError(400, 'VALIDATION_ERROR', errors.join('; ')))
  next()
}

export function validateSellerOrderStatus(request, _response, next) {
  if (
    !['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].includes(request.body?.status)
  ) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid seller order status'))
  }
  next()
}
