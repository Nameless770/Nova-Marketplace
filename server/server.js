import dotenv from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { logger } from './utils/logger.js'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
// `override` so server/.env is authoritative in local development: a stale
// ANTHROPIC_API_KEY (or similar) exported in the shell would otherwise silently
// win and be very hard to spot. Safe in production — .env is gitignored and
// excluded from the image, so there is no file there and real env vars stand.
dotenv.config({ path: join(serverDirectory, '.env'), override: true })

const { app } = await import('./app.js')
const { releaseExpiredReservations } = await import('./services/inventoryService.js')
const { reconcilePendingRefunds } = await import('./services/refundService.js')

const port = Number(process.env.PORT || 5000)
const reservationCleanupIntervalMs = Number(
  process.env.RESERVATION_CLEANUP_INTERVAL_MS || 60 * 1000,
)
// Refunds settle by webhook within seconds; this only catches the ones that did
// not, so it runs far less often than the reservation sweep.
const refundReconcileIntervalMs = Number(process.env.REFUND_RECONCILE_INTERVAL_MS || 10 * 60 * 1000)

let httpServer
let reservationCleanupTimer
let reservationCleanupRunning = false
let refundReconcileTimer
let refundReconcileRunning = false

async function cleanupExpiredReservations() {
  if (reservationCleanupRunning) return
  reservationCleanupRunning = true
  try {
    const summary = await releaseExpiredReservations()
    if (summary.released > 0) {
      logger.info({ released: summary.released }, 'released expired inventory reservations')
    }
  } catch (error) {
    logger.error({ err: error }, 'expired reservation cleanup failed')
  } finally {
    reservationCleanupRunning = false
  }
}

async function reconcileRefunds() {
  if (refundReconcileRunning) return
  refundReconcileRunning = true
  try {
    const summary = await reconcilePendingRefunds()
    if (summary.submitted || summary.settled || summary.failed) {
      logger.info(
        { submitted: summary.submitted, settled: summary.settled, failed: summary.failed },
        'refund reconciliation',
      )
    }
  } catch (error) {
    logger.error({ err: error }, 'refund reconciliation failed')
  } finally {
    refundReconcileRunning = false
  }
}

async function startServer() {
  try {
    await connectDatabase()
    await cleanupExpiredReservations()
    reservationCleanupTimer = setInterval(cleanupExpiredReservations, reservationCleanupIntervalMs)
    reservationCleanupTimer.unref?.()
    refundReconcileTimer = setInterval(reconcileRefunds, refundReconcileIntervalMs)
    refundReconcileTimer.unref?.()
    httpServer = app.listen(port, () => {
      logger.info({ port }, 'marketplace API listening')
    })
  } catch (error) {
    logger.fatal({ err: error }, 'unable to start the marketplace API')
    await disconnectDatabase()
    process.exitCode = 1
  }
}

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down')

  if (reservationCleanupTimer) clearInterval(reservationCleanupTimer)
  if (refundReconcileTimer) clearInterval(refundReconcileTimer)

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()))
    })
  }

  await disconnectDatabase()
}

process.once('SIGINT', () => {
  shutdown('SIGINT').catch((error) => {
    logger.error({ err: error }, 'graceful shutdown failed')
    process.exitCode = 1
  })
})

process.once('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => {
    logger.error({ err: error }, 'graceful shutdown failed')
    process.exitCode = 1
  })
})

startServer()
