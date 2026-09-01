/**
 * Strips obvious personal identifiers from text before it leaves the process for
 * a third-party model provider.
 *
 * A free-text box attracts things nobody intended to send — a phone number in
 * "deliver to 07700 900123", an email, a card number. Sending those to an
 * external processor is a data-protection exposure that no amount of prompt
 * engineering undoes, and the model never needs them to pick a product.
 *
 * This is deliberately conservative: it targets high-confidence patterns and
 * accepts that it will not catch everything. It is a reduction in exposure, not
 * a guarantee, and it is applied at the single egress point so there is one
 * place to audit.
 */

// Order matters: card numbers before generic long digit runs, so a card is not
// first mangled into a phone number.
const RULES = [
  // Email addresses.
  [/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[email]'],
  // Card-length digit runs, optionally split by spaces or hyphens. Anchored so
  // the match ends on a digit — a trailing `[ -]?` would swallow the separator
  // after the number and glue the surrounding words together.
  [/\b\d(?:[ -]?\d){12,18}\b/g, '[card]'],
  // International and national phone numbers.
  [/\+\d[\d\s().-]{7,}\d/g, '[phone]'],
  [/\b0\d[\d\s().-]{7,}\d\b/g, '[phone]'],
  // IBAN-shaped account identifiers.
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, '[account]'],
]

export function redactPii(value) {
  if (typeof value !== 'string' || !value) return value
  return RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
}

/**
 * Applies redaction across a message list, whatever shape the content takes.
 * Tool results are left alone: they are our own database rows, not user text,
 * and mangling an id would break the grounding contract.
 */
export function redactMessages(messages) {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return { ...message, content: redactPii(message.content) }
    }
    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map((block) =>
          block?.type === 'text' ? { ...block, text: redactPii(block.text) } : block,
        ),
      }
    }
    return message
  })
}
