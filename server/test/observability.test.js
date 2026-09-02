import pino from 'pino'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { registry } from '../middleware/metrics.js'
import { redact } from '../utils/logger.js'

describe('metrics endpoint', () => {
  it('serves Prometheus text on /metrics', async () => {
    const response = await request(app).get('/metrics')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/text\/plain/)
    expect(response.text).toContain('marketplace_http_request_duration_seconds')
  })

  it('exposes process metrics, including event-loop lag', async () => {
    const text = await registry.metrics()

    // The first thing to move when a Node process is starved.
    expect(text).toContain('marketplace_nodejs_eventloop_lag_seconds')
    expect(text).toContain('marketplace_process_resident_memory_bytes')
  })

  it('records a request against its route pattern, not the raw path', async () => {
    await request(app).get('/api/v1/products/507f1f77bcf86cd799439011')
    const text = await registry.metrics()

    // The id must not appear as a label, or every product mints a new series.
    expect(text).toContain('route="/api/v1/products/:productId"')
    expect(text).not.toContain('507f1f77bcf86cd799439011')
  })

  it('collapses unmatched paths into one series rather than one per URL', async () => {
    await request(app).get('/api/v1/definitely-not-a-route')
    await request(app).get('/api/v1/also-not-a-route')
    const text = await registry.metrics()

    expect(text).toContain('route="unmatched"')
    expect(text).not.toContain('definitely-not-a-route')
  })

  it('does not count the scrape itself', async () => {
    await request(app).get('/metrics')
    const text = await registry.metrics()

    expect(text).not.toContain('route="/metrics"')
  })
})

describe('request correlation', () => {
  it('returns a request id so a log line can be tied to a response', async () => {
    const response = await request(app).get('/api/health')
    expect(response.headers['x-request-id']).toMatch(/[0-9a-f-]{8,}/)
  })

  it('honours an inbound request id so a trace survives a proxy', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('x-request-id', 'trace-from-upstream')

    expect(response.headers['x-request-id']).toBe('trace-from-upstream')
  })
})

describe('log redaction', () => {
  // A secret leaks because someone logged an object they had not inspected, so
  // the guarantee has to live in the logger rather than at each call site.
  // These log through the real redaction config into a capture stream.
  const captureLogger = () => {
    const lines = []
    const stream = { write: (line) => lines.push(JSON.parse(line)) }
    return { log: pino({ level: 'info', redact }, stream), lines }
  }

  it('censors an Authorization header', () => {
    const { log, lines } = captureLogger()
    log.info({ req: { headers: { authorization: 'Bearer super-secret-token' } } }, 'request')

    expect(lines[0].req.headers.authorization).toBe('[redacted]')
    expect(JSON.stringify(lines[0])).not.toContain('super-secret-token')
  })

  it('censors passwords anywhere in the object', () => {
    const { log, lines } = captureLogger()
    log.info({ req: { body: { password: 'hunter2', email: 'a@b.com' } } }, 'login')

    expect(lines[0].req.body.password).toBe('[redacted]')
    // Non-secret context must survive, or the log stops being useful.
    expect(lines[0].req.body.email).toBe('a@b.com')
  })

  it.each(['passwordHash', 'accessToken', 'apiKey', 'MONGODB_URI'])(
    'censors %s wherever it appears',
    (field) => {
      const { log, lines } = captureLogger()
      log.info({ anything: { [field]: 'must-not-appear' } }, 'event')

      expect(JSON.stringify(lines[0])).not.toContain('must-not-appear')
    },
  )
})
