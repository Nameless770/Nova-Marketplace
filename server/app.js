import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import sellerRoutes from './routes/sellerRoutes.js'
import productRoutes from './routes/productRoutes.js'
import categoryRoutes from './routes/categoryRoutes.js'
import inventoryRoutes from './routes/inventoryRoutes.js'
import cartRoutes from './routes/cartRoutes.js'
import userRoutes from './routes/userRoutes.js'
import { AppError } from './utils/errors.js'

export const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'marketplace-api', timestamp: new Date().toISOString() })
})

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/sellers', sellerRoutes)
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/products', productRoutes)
app.use('/api/v1/categories', categoryRoutes)
app.use('/api/v1/inventory', inventoryRoutes)
app.use('/api/v1/cart', cartRoutes)

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
