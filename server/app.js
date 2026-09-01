import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import mongoose from 'mongoose'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import aiRoutes from './routes/aiRoutes.js'
import sellerRoutes from './routes/sellerRoutes.js'
import productRoutes from './routes/productRoutes.js'
import categoryRoutes from './routes/categoryRoutes.js'
import inventoryRoutes from './routes/inventoryRoutes.js'
import cartRoutes from './routes/cartRoutes.js'
import wishlistRoutes from './routes/wishlistRoutes.js'
import orderRoutes from './routes/orderRoutes.js'
import paymentRoutes from './routes/paymentRoutes.js'
import recommendationRoutes from './routes/recommendationRoutes.js'
import refundRoutes from './routes/refundRoutes.js'
import reviewRoutes from './routes/reviewRoutes.js'
import qaRoutes from './routes/qaRoutes.js'
import couponRoutes from './routes/couponRoutes.js'
import { globalRateLimit } from './middleware/rateLimit.js'
import { stripeWebhook } from './controllers/paymentController.js'
import { asyncHandler } from './utils/errors.js'
import userRoutes from './routes/userRoutes.js'
import { AppError } from './utils/errors.js'
import notificationRoutes from './routes/notificationRoutes.js'

export const app = express()

// Failing open to a localhost origin in production would break the real
// frontend while allowing a locally-served attacker page to call the API.
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_ORIGIN) {
  throw new Error('CLIENT_ORIGIN must be set in production')
}

app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.post(
  '/api/v1/payments/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(stripeWebhook),
)
app.use(express.json({ limit: '1mb' }))

// A ceiling over everything, mounted before the routers so no route can be
// reached without passing it. Per-route limits stay on top for the endpoints
// that need something tighter. Configurable so a load test can raise it.
app.use(globalRateLimit({ max: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 600 }))

app.get('/', (_request, response) => {
  response.json({
    success: true,
    service: 'marketplace-api',
    frontend: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    health: '/api/health',
  })
})

// Liveness: the process is up and serving. Deliberately does not touch the
// database — a slow query must not get the container restarted.
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'marketplace-api', timestamp: new Date().toISOString() })
})

// Readiness: the process can actually do its job. Orchestrators should route
// traffic on this one, because an API that cannot reach MongoDB is not ready
// even though it is alive.
app.get('/api/health/ready', (_request, response) => {
  const state = mongoose.connection.readyState
  const ready = state === 1
  response.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    database: ['disconnected', 'connected', 'connecting', 'disconnecting'][state] ?? 'unknown',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/sellers', sellerRoutes)
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/products', productRoutes)
app.use('/api/v1/categories', categoryRoutes)
app.use('/api/v1/inventory', inventoryRoutes)
app.use('/api/v1/cart', cartRoutes)
app.use('/api/v1/wishlist', wishlistRoutes)
app.use('/api/v1/orders', orderRoutes)
app.use('/api/v1/payments', paymentRoutes)
app.use('/api/v1/ai', aiRoutes)
app.use('/api/v1/recommendations', recommendationRoutes)
app.use('/api/v1/refunds', refundRoutes)
app.use('/api/v1/reviews', reviewRoutes)
app.use('/api/v1/qa', qaRoutes)
app.use('/api/v1/coupons', couponRoutes)
app.use('/api/v1/notifications', notificationRoutes)

app.use((_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'))
})

app.use((error, request, response, _next) => {
  const isDuplicateKey = error.code === 11000
  const statusCode =
    error.statusCode || (error.name === 'ValidationError' || isDuplicateKey ? 400 : 500)
  const code = error.statusCode
    ? error.code
    : isDuplicateKey
      ? 'DUPLICATE_RESOURCE'
      : error.name === 'ValidationError'
        ? 'VALIDATION_ERROR'
        : 'INTERNAL_ERROR'

  if (statusCode === 500) console.error(`[${request.method} ${request.originalUrl}]`, error)

  response.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode === 500 ? 'Internal server error' : error.message,
    },
  })
})
