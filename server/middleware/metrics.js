import client from 'prom-client'

/**
 * Prometheus metrics.
 *
 * Deliberately a small, fixed set. Every distinct label combination is a separate
 * time series that the scraper stores forever, so the cost of a metric is paid in
 * cardinality, not in the counter itself.
 */
export const registry = new client.Registry()

// Heap, resident memory, GC pauses, and — the one that matters most for Node —
// event-loop lag, which is the first thing to move when the process is starved.
client.collectDefaultMetrics({ register: registry, prefix: 'marketplace_' })

const httpDuration = new client.Histogram({
  name: 'marketplace_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  // `route` is the Express route *pattern*, never the raw path — see routeOf().
  labelNames: ['method', 'route', 'status'],
  // Tuned for an API rather than prom-client's defaults: most responses land
  // under 100ms, and the tail above 1s is what indicates a problem.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
})

const httpInFlight = new client.Gauge({
  name: 'marketplace_http_requests_in_flight',
  help: 'Requests currently being handled',
  registers: [registry],
})

const dbDuration = new client.Histogram({
  name: 'marketplace_mongodb_command_duration_seconds',
  help: 'MongoDB command duration in seconds',
  labelNames: ['command', 'collection', 'success'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5],
  registers: [registry],
})

const aiRequests = new client.Counter({
  name: 'marketplace_ai_requests_total',
  help: 'Model provider calls by outcome',
  labelNames: ['outcome'],
  registers: [registry],
})

/**
 * The Express route pattern — `/products/:productId`, not `/products/abc123`.
 *
 * Labelling with the raw path would mint a new time series per product id and
 * blow up the scraper's memory. Unmatched paths collapse to a single bucket so a
 * 404 scan cannot do the same thing.
 */
function routeOf(request) {
  if (!request.route) return request.path.startsWith('/api') ? 'unmatched' : 'other'

  // `req.baseUrl` carries the router's mount path, but only while Express is
  // inside that router: an error unwinds to the app-level handler, which resets
  // it to ''. Falling back to the versioned prefix from the original URL keeps
  // the label stable whether the request succeeded or threw.
  const path = request.originalUrl.split('?')[0]
  const mount = request.baseUrl || apiMountOf(path)
  const routePath = request.route.path === '/' ? '' : request.route.path
  return `${mount}${routePath}` || path
}

// `/api/v1/products/abc` -> `/api/v1/products`. Anything not under the versioned
// API keeps an empty mount and is labelled by its own route path.
function apiMountOf(path) {
  const segments = path.split('/').filter(Boolean)
  return segments[0] === 'api' && segments.length >= 3 ? `/${segments.slice(0, 3).join('/')}` : ''
}

export function metricsMiddleware(request, response, next) {
  // The scrape itself is not interesting, and counting it inflates the rate.
  if (request.path === '/metrics') return next()

  const stop = httpDuration.startTimer()
  httpInFlight.inc()

  // The route cannot be read when the request arrives (Express has not matched
  // one yet) nor on `finish` (by then `req.baseUrl` has unwound to '' and the
  // label loses its router prefix). `res.end` is the last moment still inside
  // dispatch, so the route is snapshotted there and observed on finish.
  let route = null
  const end = response.end
  response.end = function patchedEnd(...args) {
    if (route === null) route = routeOf(request)
    return end.apply(this, args)
  }

  response.on('finish', () => {
    httpInFlight.dec()
    stop({
      method: request.method,
      route: route ?? routeOf(request),
      status: response.statusCode,
    })
  })
  next()
}

/**
 * Times every MongoDB command. This is what distinguishes "the API is slow" from
 * "the database is slow", which is otherwise guesswork.
 *
 * Requires the client to have been created with `monitorCommands: true`.
 */
export function instrumentMongo(mongoClient) {
  // Only the start event carries the command document, so the collection has to
  // be captured there and carried through to the outcome.
  const started = new Map()

  mongoClient.on('commandStarted', (event) => {
    // The collection is the value of the field named after the command:
    // `{ find: 'products' }`, `{ insert: 'orders' }`. Administrative commands
    // carry a number there instead, so anything non-string is discarded.
    const target = event.command?.[event.commandName]
    started.set(event.requestId, {
      command: event.commandName,
      collection: typeof target === 'string' ? target : 'none',
      at: process.hrtime.bigint(),
    })
  })

  const finish = (event, success) => {
    const begun = started.get(event.requestId)
    if (!begun) return
    started.delete(event.requestId)
    dbDuration.observe(
      { command: begun.command, collection: begun.collection, success: String(success) },
      Number(process.hrtime.bigint() - begun.at) / 1e9,
    )
  }

  mongoClient.on('commandSucceeded', (event) => finish(event, true))
  mongoClient.on('commandFailed', (event) => finish(event, false))
}

export function recordAiOutcome(outcome) {
  aiRequests.inc({ outcome })
}

export async function metricsHandler(_request, response) {
  response.set('Content-Type', registry.contentType)
  response.end(await registry.metrics())
}
