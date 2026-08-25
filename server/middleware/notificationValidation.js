import mongoose from 'mongoose'
import { AppError } from '../utils/errors.js'

export function validateNotificationId(request, _response, next) {
  if (!mongoose.isValidObjectId(request.params.notificationId))
    return next(new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found'))
  next()
}
