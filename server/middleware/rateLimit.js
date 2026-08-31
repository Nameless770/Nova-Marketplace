import { AppError } from '../utils/errors.js'

/**
 * In-process fixed-window counters.
 *
 * Correct for a single instance and deliberately simple. Before running a second
 * instance these buckets must move to Redis — the interface here is the only
 * thing that would need to change.
 */
const buckets = new Map()

function bucketFor(key, windowMs) {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || now > existing.resetAt) {
    const fresh = { count: 0, resetAt: now + windowMs }
    buckets.set(key, fresh)
    return fresh
  }
  return existing
}

export function consumeBucket(key, max, windowMs) {
  const bucket = bucketFor(key, windowMs)
  bucket.count += 1
  return {
    allowed: bucket.count <= max,
    retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - Date.now()) / 1000), 1),
  }
}

export function peekBucket(key, max, windowMs) {
  const bucket = bucketFor(key, windowMs)
  return {
    allowed: bucket.count < max,
    retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - Date.now()) / 1000), 1),
  }
}

export function recordFailure(key, windowMs) {
  bucketFor(key, windowMs).count += 1
}

export function clearBucket(key) {
  buckets.delete(key)
}

export function resetAllRateLimits() {
  buckets.clear()
}

function tooManyRequests(response, retryAfterSeconds, message) {
  response.set('Retry-After', String(retryAfterSeconds))
  return new AppError(429, 'RATE_LIMITED', message)
}

/**
 * Generic per-IP throttle for routes that are expensive or enumerable.
 */
export function rateLimit({ max = 60, windowMs = 60_000, message = 'Too many requests' } = {}) {
  return function limiter(request, response, next) {
    const { allowed, retryAfterSeconds } = consumeBucket(
      `ip:${request.ip}:${request.baseUrl}${request.path}`,
      max,
      windowMs,
    )
    if (!allowed) return next(tooManyRequests(response, retryAfterSeconds, message))
    next()
  }
}

/**
 * Brute-force protection for credential endpoints.
 *
 * Counts only *failed* attempts, so a legitimate user is never locked out by
 * their own successful logins. Two buckets are checked: one per account (stops
 * guessing a single password) and one per IP (stops spraying one guess across
 * many accounts).
 *
 * Failures are recorded from the response status rather than by the controller,
 * so the auth handlers stay unaware of throttling.
 */
export function credentialGuard({
  windowMs = 15 * 60_000,
  maxAccountFailures = 5,
  maxIpFailures = 20,
} = {}) {
  return function guard(request, response, next) {
    const email =
      typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const accountKey = email ? `login:acct:${email}` : null
    const ipKey = `login:ip:${request.ip}`

    const ipState = peekBucket(ipKey, maxIpFailures, windowMs)
    if (!ipState.allowed) {
      return next(
        tooManyRequests(
          response,
          ipState.retryAfterSeconds,
          'Too many failed attempts. Try again later.',
        ),
      )
    }

    if (accountKey) {
      const accountState = peekBucket(accountKey, maxAccountFailures, windowMs)
      if (!accountState.allowed) {
        return next(
          tooManyRequests(
            response,
            accountState.retryAfterSeconds,
            'Too many failed attempts for this account. Try again later.',
          ),
        )
      }
    }

    response.on('finish', () => {
      // 401 is the only signal of a bad credential; validation errors and
      // successes must not count toward a lockout.
      if (response.statusCode === 401) {
        recordFailure(ipKey, windowMs)
        if (accountKey) recordFailure(accountKey, windowMs)
      } else if (response.statusCode < 400 && accountKey) {
        clearBucket(accountKey)
      }
    })

    next()
  }
}
