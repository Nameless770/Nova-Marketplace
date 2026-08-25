import { AppError } from '../utils/errors.js'

const fields = ['firstName', 'lastName', 'line1', 'city', 'state', 'postalCode', 'country']

function validateAddress(address, name) {
  if (!address || typeof address !== 'object') return `${name} is required`
  const errors = fields.filter(
    (field) => typeof address[field] !== 'string' || !address[field].trim(),
  )
  if (address.country && !/^[a-z]{2}$/i.test(address.country))
    errors.push(`${name}.country must be a 2-letter ISO code`)
  return errors.length ? `${name} is invalid` : null
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
