import dns from 'node:dns'
import mongoose from 'mongoose'
import { instrumentMongo } from '../middleware/metrics.js'
import { logger } from '../utils/logger.js'

export async function connectDatabase() {
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
  await mongoose.connect(mongoUri, { monitorCommands: true })
  instrumentMongo(mongoose.connection.getClient())
  logger.info('MongoDB connected')
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
    logger.info('MongoDB disconnected')
  }
}
