import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll } from 'vitest'

let replicaSet

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough'
  process.env.JWT_EXPIRES_IN = '15m'
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit'
  process.env.PAYMENT_SUCCESS_URL =
    'http://localhost:5173/payment/success?session_id={CHECKOUT_SESSION_ID}'
  process.env.PAYMENT_CANCEL_URL = 'http://localhost:5173/payment/cancelled'

  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(replicaSet.getUri())
  await mongoose.connection.db.admin().command({ ping: 1 })
})

afterEach(async () => {
  const collections = await mongoose.connection.db.collections()
  await Promise.all(collections.map((collection) => collection.deleteMany({})))
})

afterAll(async () => {
  await mongoose.disconnect()
  await replicaSet?.stop()
})
