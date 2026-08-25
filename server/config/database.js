import dns from 'node:dns'
import mongoose from 'mongoose'

export async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured')
  }

  const dnsServers = process.env.DNS_SERVERS?.split(',')
    .map((server) => server.trim())
    .filter(Boolean)
  if (dnsServers?.length) dns.setServers(dnsServers)

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error.message)
  })

  await mongoose.connect(mongoUri)
  console.log('MongoDB connected')
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
    console.log('MongoDB disconnected')
  }
}
