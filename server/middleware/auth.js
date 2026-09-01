import { Seller } from '../models/Seller.js'
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

    // Deliberately without +passwordHash: no route that reaches this middleware
    // verifies a password, and every service that does re-fetches it itself.
    // Keeping the hash out of request scope removes a whole class of leak.
    const user = await User.findById(payload.sub).lean()
    if (!user || user.status !== 'active')
      throw new AppError(401, 'INVALID_SESSION', 'User session is invalid')

    request.user = user
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Attaches request.user when a valid token is present, and does nothing when it
 * is absent or invalid. For public routes that behave slightly differently for a
 * signed-in shopper — never as a substitute for authenticate on a protected one.
 */
export async function optionalAuthenticate(request, _response, next) {
  const header = request.get('authorization')
  if (!header?.startsWith('Bearer ')) return next()

  try {
    const payload = verifyAccessToken(header.slice(7))
    const user = await User.findById(payload.sub).lean()
    if (user && user.status === 'active') request.user = user
  } catch {
    // An invalid token on a public route is simply an anonymous request.
  }
  next()
}

/**
 * Role gate. For sellers it additionally requires an approved store.
 *
 * Approval is read from the `Seller` collection, which is the single source of
 * truth. `user.sellerApprovalStatus` mirrors it for display, but authorising
 * against that copy would mean a suspended seller keeps access for as long as
 * the two disagree — and the services downstream already scope on `Seller`, so
 * checking anything else here just invites them to drift apart.
 */
export function authorize(...roles) {
  return async (request, _response, next) => {
    try {
      if (!request.user || !roles.includes(request.user.role)) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions')
      }

      if (request.user.role === 'seller') {
        // Indexed unique lookup on ownerUserId — cheap, and only on seller routes.
        const seller = await Seller.findOne({ ownerUserId: request.user._id })
          .select('_id status')
          .lean()
        if (seller?.status !== 'approved') {
          throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions')
        }
        // Hand the resolved seller downstream so services need not re-query it.
        request.seller = seller
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}
