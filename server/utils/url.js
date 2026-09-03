/**
 * Image URLs are supplied by sellers, who are only semi-trusted, and are then
 * rendered in every shopper's browser. Without a scheme allowlist a `javascript:`
 * or `data:` URL is a stored-XSS vector, so the scheme is checked on write —
 * validation at the boundary rather than escaping at each render site.
 *
 * `http:` is rejected as well as the dangerous schemes: a plain-HTTP image on an
 * HTTPS page is blocked as mixed content anyway, so accepting it only produces
 * listings with silently broken images.
 */
const ALLOWED_PROTOCOLS = new Set(['https:'])

export const MAX_URL_LENGTH = 2048

export function isSafeImageUrl(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return false
  try {
    // The URL parser resolves the scheme properly, which defeats the obfuscation
    // a substring check misses — `java\tscript:`, `JaVaScRiPt:`, and so on.
    return ALLOWED_PROTOCOLS.has(new URL(trimmed).protocol)
  } catch {
    // Not an absolute URL at all.
    return false
  }
}

export const IMAGE_URL_MESSAGE = 'must be an absolute https:// URL of at most 2048 characters'

/**
 * A request URL safe to write to a log.
 *
 * The request logger records `req.url` for every request, and OAuth redirects
 * arrive as `/api/v1/auth/google/callback?code=...&state=...`. An authorization
 * code is a live credential — short-lived and single-use, but still enough to
 * mint a session — so logging it verbatim would put a working credential in the
 * log aggregator. The path and the parameter *names* stay, because those are
 * what makes a log searchable; only the values of sensitive keys are replaced.
 */
const SENSITIVE_PARAMS = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'client_secret',
  'password',
])

export function loggableUrl(value) {
  if (typeof value !== 'string') return value
  const split = value.indexOf('?')
  if (split === -1) return value
  const path = value.slice(0, split)
  const params = new URLSearchParams(value.slice(split + 1))
  for (const key of params.keys()) {
    if (SENSITIVE_PARAMS.has(key.toLowerCase())) params.set(key, '[redacted]')
  }
  const query = params.toString()
  return query ? `${path}?${decodeURIComponent(query)}` : path
}
