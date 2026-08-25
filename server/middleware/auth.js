import { User } from '../models/User.js'
import { AppError } from '../utils/errors.js'
import { verifyAccessToken } from '../utils/jwt.js'

export async function authenticate(request, _response, next) {
  try {
    const header = request.get('authorization')
    if (!header?.startsWith('Bearer '))
      throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Bearer token required')

    let payload
    try {
      payload = verifyAccessToken(header.slice(7))
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token')
    }

    const user = await User.findById(payload.sub).select('+passwordHash').lean()
    if (!user || user.status !== 'active')
      throw new AppError(401, 'INVALID_SESSION', 'User session is invalid')

    request.user = user
    next()
  } catch (error) {
    next(error)
  }
}

export function authorize(...roles) {
  return (request, _response, next) => {
    const sellerIsApproved =
      request.user?.role !== 'seller' || request.user.sellerApprovalStatus === 'approved'

    if (!request.user || !roles.includes(request.user.role) || !sellerIsApproved) {
      return next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'))
    }
    next()
  }
}
