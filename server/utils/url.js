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
