import { AppError } from '../utils/errors.js'
import { isAiConfigured } from '../services/ai/provider.js'

export function requireAiConfigured(_request, _response, next) {
  if (!isAiConfigured())
    return next(new AppError(503, 'AI_NOT_CONFIGURED', 'The AI assistant is not configured'))
  next()
}

export function validateAdminQuestion(request, _response, next) {
  const question = request.body?.question
  if (typeof question !== 'string' || !question.trim())
    return next(new AppError(400, 'VALIDATION_ERROR', 'question is required'))
  if (question.length > 500)
    return next(new AppError(400, 'VALIDATION_ERROR', 'question must be at most 500 characters'))
  next()
}

export function validateSearchQuery(request, _response, next) {
  const query = request.body?.query
  if (typeof query !== 'string' || !query.trim())
    return next(new AppError(400, 'VALIDATION_ERROR', 'query is required'))
  if (query.length > 200)
    return next(new AppError(400, 'VALIDATION_ERROR', 'query must be at most 200 characters'))
  next()
}

export function validateAssistantQuery(request, _response, next) {
  const query = request.body?.query
  if (typeof query !== 'string' || !query.trim())
    return next(new AppError(400, 'VALIDATION_ERROR', 'query is required'))
  if (query.length > 500)
    return next(new AppError(400, 'VALIDATION_ERROR', 'query must be at most 500 characters'))
  next()
}

// In-process token bucket. Redis is the right home for this once there is more
// than one instance; until then this still bounds a single caller's spend.
const buckets = new Map()
const WINDOW_MS = 60 * 1000

/**
 * Anonymous callers are bucketed by IP and given a tighter allowance, because an
 * unauthenticated endpoint that costs money per call is the easiest thing in the
 * system to abuse.
 */
export function aiRateLimit({ authenticated = 10, anonymous = 4 } = {}) {
  return function rateLimitAi(request, response, next) {
    const userId = request.user?._id?.toString()
    const key = userId ? `u:${userId}` : `ip:${request.ip}`
    const max = userId ? authenticated : anonymous
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
      return next()
    }
    if (bucket.count >= max) {
      response.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      return next(new AppError(429, 'AI_RATE_LIMITED', 'Too many requests. Try again shortly.'))
    }
    bucket.count += 1
    next()
  }
}

export function resetAiRateLimits() {
  buckets.clear()
}

// Keeps the map from growing without bound in a long-lived process.
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) if (now > bucket.resetAt) buckets.delete(key)
}, WINDOW_MS).unref?.()
