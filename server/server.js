import dotenv from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectDatabase, disconnectDatabase } from './config/database.js'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(serverDirectory, '.env') })

const { app } = await import('./app.js')

const port = Number(process.env.PORT || 5000)

let httpServer

async function startServer() {
  try {
    await connectDatabase()
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
