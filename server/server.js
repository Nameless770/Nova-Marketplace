import dotenv from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectDatabase, disconnectDatabase } from './config/database.js'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(serverDirectory, '.env') })

const { app } = await import('./app.js')
const { releaseExpiredReservations } = await import('./services/inventoryService.js')

const port = Number(process.env.PORT || 5000)
const reservationCleanupIntervalMs = Number(
  process.env.RESERVATION_CLEANUP_INTERVAL_MS || 60 * 1000,
)

let httpServer
let reservationCleanupTimer
let reservationCleanupRunning = false

async function cleanupExpiredReservations() {
  if (reservationCleanupRunning) return
  reservationCleanupRunning = true
  try {
    const summary = await releaseExpiredReservations()
    if (summary.released > 0) {
      console.log(`Released ${summary.released} expired inventory reservation(s)`)
    }
  } catch (error) {
    console.error('Expired reservation cleanup failed:', error.message)
  } finally {
    reservationCleanupRunning = false
  }
}

async function startServer() {
  try {
    await connectDatabase()
    await cleanupExpiredReservations()
    reservationCleanupTimer = setInterval(cleanupExpiredReservations, reservationCleanupIntervalMs)
    reservationCleanupTimer.unref?.()
    httpServer = app.listen(port, () => {
      console.log(`Marketplace API listening on http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Unable to start the marketplace API:', error.message)
    await disconnectDatabase()
    process.exitCode = 1
  }
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`)

  if (reservationCleanupTimer) clearInterval(reservationCleanupTimer)

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()))
    })
  }

  await disconnectDatabase()
}

process.once('SIGINT', () => {
  shutdown('SIGINT').catch((error) => {
    console.error('Graceful shutdown failed:', error.message)
    process.exitCode = 1
  })
})

process.once('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => {
    console.error('Graceful shutdown failed:', error.message)
    process.exitCode = 1
  })
})

startServer()
