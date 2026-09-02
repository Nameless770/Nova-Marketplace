import pino from 'pino'

/**
 * The application logger.
 *
 * One JSON object per event, on stdout. Nothing writes to a file: the container
 * runtime captures stdout, and a process that owns log files needs volumes,
 * rotation and disk monitoring that a stateless service should not carry.
 *
 * Redaction is configured here rather than at each call site. A secret leaks
 * because someone logged an object they had not inspected, so the safe place to
 * decide what never gets printed is the logger itself.
 */
export const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["idempotency-key"]',
    'req.body.password',
    'req.body.currentPassword',
    'req.body.newPassword',
    'res.headers["set-cookie"]',
    '*.passwordHash',
    '*.password',
    '*.token',
    '*.accessToken',
    '*.apiKey',
    '*.ANTHROPIC_API_KEY',
    '*.MONGODB_URI',
    '*.STRIPE_SECRET_KEY',
  ],
  censor: '[redacted]',
}

// Tests assert on behaviour, not on log output; leaving it on floods the runner.
const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info')

// Pretty output is a development convenience only. In production the JSON is the
// point — it is what a log aggregator can actually query.
const transport =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined

export const logger = pino({
  level,
  redact,
  base: { service: 'marketplace-api' },
  formatters: {
    // `level: "info"` is far easier to filter on than pino's numeric default.
    level: (label) => ({ level: label }),
  },
  transport,
})

/**
 * A child logger bound to one request, so every line emitted while handling it
 * carries the same `requestId`. Without that correlation a 500 in the log cannot
 * be tied to the request that caused it.
 */
export function requestLogger(request) {
  return request.log ?? logger
}
