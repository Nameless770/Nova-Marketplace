// Vercel serverless entry point for the "server" service (services mode).
// server.js is the long-running (Docker/Kubernetes) entry point and is never
// used on Vercel: it opens a TCP listener and runs setInterval background
// jobs, neither of which survive a function instance being torn down between
// invocations. This file exists purely to adapt the same Express app to a
// single request/response call.
//
// Replaces the old root-level api/index.js now that the service's root is
// server/ — same logic, just relative imports fixed for the new location.
import { connectDatabase } from './config/database.js'
import { app } from './app.js'

let connection

// Reused across invocations while the function instance stays warm; a failed
// attempt is cleared so the next request retries instead of caching the error.
//
// The timeout is well inside the function's own 30s budget (see vercel.json).
// With Mongoose's 30s default the two deadlines collide and the platform kills
// the invocation first, so the 503 below could never actually be sent.
function ensureDatabase() {
  connection ??= connectDatabase({ serverSelectionTimeoutMS: 8000 }).catch((error) => {
    connection = undefined
    throw error
  })
  return connection
}

export default async function handler(request, response) {
  // Health checks must answer while the database is down — that is the entire
  // reason liveness exists, and readiness reports connection state from
  // `mongoose.connection.readyState` without needing a live connection itself.
  // Gating them behind the connect turned a database outage into a total
  // blackout in which nothing, not even /api/health, could respond.
  if (request.url?.startsWith('/api/health')) {
    return app(request, response)
  }

  try {
    await ensureDatabase()
  } catch {
    // Raw Node APIs, not `response.status().json()`: this path runs *before*
    // `app(request, response)` hands the response to Express, so the Express
    // helpers do not exist on it yet. Calling them throws a TypeError, which
    // the platform reports as a generic invocation failure — the real error is
    // then invisible, which is exactly what made this hard to diagnose.
    response.statusCode = 503
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(
      JSON.stringify({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' },
      }),
    )
    return
  }
  return app(request, response)
}
