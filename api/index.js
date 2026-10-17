// Vercel serverless entry point: wraps the existing Express app so the whole API
// runs as one function. server/server.js is the long-running (Docker/Kubernetes)
// entry point; this file is only used on Vercel.
import { connectDatabase } from '../server/config/database.js'
import { app } from '../server/app.js'

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
