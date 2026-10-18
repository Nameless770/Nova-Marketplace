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
function ensureDatabase() {
  connection ??= connectDatabase().catch((error) => {
    connection = undefined
    throw error
  })
  return connection
}

export default async function handler(request, response) {
  try {
    await ensureDatabase()
  } catch {
    response.status(503).json({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' },
    })
    return
  }
  return app(request, response)
}
