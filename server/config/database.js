import dns from 'node:dns'
import mongoose from 'mongoose'
import { instrumentMongo } from '../middleware/metrics.js'
import { logger } from '../utils/logger.js'

/**
 * @param serverSelectionTimeoutMS  How long to hunt for a reachable server
 *   before giving up. Mongoose defaults to 30s, which is fine for a
 *   long-running process that can afford to wait and retry. A serverless
 *   invocation cannot: its own budget is 30s, so the default guarantees the
 *   function is killed before the driver ever reports failure, turning an
 *   unreachable database into an opaque 504 instead of a readable error.
 */
export async function connectDatabase({ serverSelectionTimeoutMS } = {}) {
  const mongoUri = process.env.MONGODB_URI

  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI is not configured. Copy server/.env.example to server/.env and set MONGODB_URI to your MongoDB connection string.',
    )
  }

  const dnsServers = process.env.DNS_SERVERS?.split(',')
    .map((server) => server.trim())
    .filter(Boolean)
  if (dnsServers?.length) dns.setServers(dnsServers)

  mongoose.connection.on('error', (error) => {
    logger.error({ err: error }, 'MongoDB connection error')
  })

  // `monitorCommands` is what emits the events the metrics layer times. It costs
  // an event per command, which is negligible next to the round trip itself.
  await mongoose.connect(mongoUri, {
    monitorCommands: true,
    ...(serverSelectionTimeoutMS ? { serverSelectionTimeoutMS } : {}),
  })
  instrumentMongo(mongoose.connection.getClient())
  logger.info('MongoDB connected')
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
    logger.info('MongoDB disconnected')
  }
}
