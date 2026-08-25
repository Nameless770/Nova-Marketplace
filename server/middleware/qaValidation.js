import mongoose from 'mongoose'
import { AppError } from '../utils/errors.js'

export function validateQuestion(request, _response, next) {
  if (
    typeof request.body?.text !== 'string' ||
    request.body.text.trim().length < 1 ||
    request.body.text.trim().length > 2000
  ) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'Question text must be 1 to 2000 characters'))
  }
  next()
}

export function validateAnswer(request, _response, next) {
  if (!mongoose.isValidObjectId(request.params.questionId))
    return next(new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found'))
  if (
    typeof request.body?.text !== 'string' ||
    request.body.text.trim().length < 1 ||
    request.body.text.trim().length > 3000
  ) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'Answer text must be 1 to 3000 characters'))
  }
  next()
}

export function validateModeration(request, _response, next) {
  const { status, reason } = request.body ?? {}
  if (!['published', 'rejected', 'removed', 'pending'].includes(status))
    return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid moderation status'))
  if (['rejected', 'removed'].includes(status) && (typeof reason !== 'string' || !reason.trim()))
    return next(new AppError(400, 'VALIDATION_ERROR', 'A moderation reason is required'))
  next()
}
