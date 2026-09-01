import { describe, expect, it } from 'vitest'
import { isSafeImageUrl } from '../utils/url.js'
import { redactMessages, redactPii } from '../services/ai/redact.js'

describe('image url allowlist', () => {
  // Sellers supply these and every shopper renders them.
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('rejects %s', (url) => {
    expect(isSafeImageUrl(url)).toBe(false)
  })

  // Plain http on an https page is blocked as mixed content anyway, so accepting
  // it would only produce listings with silently broken images.
  it('rejects plain http', () => {
    expect(isSafeImageUrl('http://example.com/a.png')).toBe(false)
  })

  it.each([null, undefined, '', '   ', 'not a url', '//example.com/a.png'])(
    'rejects the non-absolute value %p',
    (url) => {
      expect(isSafeImageUrl(url)).toBe(false)
    },
  )

  it('rejects a url beyond the length cap', () => {
    expect(isSafeImageUrl(`https://example.com/${'a'.repeat(2100)}.png`)).toBe(false)
  })

  it('accepts ordinary https urls', () => {
    expect(isSafeImageUrl('https://images.unsplash.com/photo-123?w=800')).toBe(true)
    expect(isSafeImageUrl('  https://example.com/a.png  ')).toBe(true)
  })
})

describe('AI egress redaction', () => {
  it('removes email addresses', () => {
    expect(redactPii('mail me at bea.buyer@example.com please')).toBe('mail me at [email] please')
  })

  it.each([
    ['+44 7700 900123', '[phone]'],
    ['07700900123', '[phone]'],
    ['0770 090 0123', '[phone]'],
  ])('removes the phone number %s', (input, expected) => {
    expect(redactPii(`call ${input} now`)).toBe(`call ${expected} now`)
  })

  it('removes card-length digit runs before treating them as anything else', () => {
    expect(redactPii('card 4111 1111 1111 1111 ok')).toBe('card [card] ok')
  })

  it('leaves ordinary shopping language untouched', () => {
    const query = 'a warm reading light for a small bedroom, under $200'
    expect(redactPii(query)).toBe(query)
  })

  it('leaves product identifiers untouched, so grounding still resolves', () => {
    const text = 'product 6a962f030678029e466d6116 costs 17810'
    expect(redactPii(text)).toBe(text)
  })

  it('redacts across message shapes but never touches tool results', () => {
    const redacted = redactMessages([
      { role: 'user', content: 'ship to bea@example.com' },
      { role: 'user', content: [{ type: 'text', text: 'call +44 7700 900123' }] },
      // Tool results are our own database rows; mangling an id would break the
      // grounding contract.
      { role: 'tool', tool_call_id: 't1', content: '{"productId":"6a962f0306780"}' },
    ])

    expect(redacted[0].content).toBe('ship to [email]')
    expect(redacted[1].content[0].text).toBe('call [phone]')
    expect(redacted[2].content).toBe('{"productId":"6a962f0306780"}')
  })

  it('passes non-string values through unchanged', () => {
    expect(redactPii(null)).toBeNull()
    expect(redactPii(42)).toBe(42)
  })
})
