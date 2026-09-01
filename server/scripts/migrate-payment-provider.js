/**
 * Renames the Stripe-specific payment and refund fields to their
 * provider-neutral equivalents, and stamps each record with the provider it
 * actually used.
 *
 * Existing records are classified by evidence rather than assumption: a payment
 * whose session id looks like a locally generated one is cash; anything holding
 * a real Stripe identifier is a card payment.
 *
 *   node scripts/migrate-payment-provider.js
 *
 * Idempotent — running it twice is a no-op.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(here, '..', '.env'), override: true })

const { connectDatabase, disconnectDatabase } = await import('../config/database.js')
const mongoose = (await import('mongoose')).default

await connectDatabase()
const payments = mongoose.connection.collection('payments')
const refunds = mongoose.connection.collection('refunds')

// Checkout has always generated `local_<uuid>` for cash; Stripe uses `cs_`.
const CASH_SESSION = /^local_/

/**
 * Mongoose builds the new indexes but never removes the old ones. The stale
 * unique indexes must go first: renaming a field away leaves every document with
 * a null in the old key, which the unique constraint rejects.
 */
async function dropStaleIndexes(collection, names) {
  for (const name of names) {
    try {
      await collection.dropIndex(name)
      console.log(`  dropped stale index ${name}`)
    } catch (error) {
      // IndexNotFound (27) simply means a previous run already removed it.
      if (error.code !== 27) throw error
    }
  }
}

async function renameFields(collection, pairs) {
  const rename = {}
  for (const [from, to] of pairs) rename[from] = to
  const filter = { $or: pairs.map(([from]) => ({ [from]: { $exists: true } })) }
  const result = await collection.updateMany(filter, { $rename: rename })
  return result.modifiedCount
}

await dropStaleIndexes(payments, ['stripeSessionId_1', 'stripePaymentIntentId_1'])
await dropStaleIndexes(refunds, ['stripeRefundId_1'])

const renamedPayments = await renameFields(payments, [
  ['stripeSessionId', 'providerSessionId'],
  ['stripeCheckoutUrl', 'providerCheckoutUrl'],
  ['stripePaymentIntentId', 'providerPaymentIntentId'],
])
const renamedRefunds = await renameFields(refunds, [['stripeRefundId', 'providerRefundId']])

// Stamp the provider on anything that predates the field.
const cash = await payments.updateMany(
  { provider: { $exists: false }, providerSessionId: CASH_SESSION },
  { $set: { provider: 'cash' } },
)
const card = await payments.updateMany(
  { provider: { $exists: false } },
  { $set: { provider: 'stripe' } },
)

// A refund inherits its payment's provider.
let refundsStamped = 0
for (const provider of ['cash', 'stripe']) {
  const ids = await payments.distinct('_id', { provider })
  if (!ids.length) continue
  const result = await refunds.updateMany(
    { provider: { $exists: false }, paymentId: { $in: ids } },
    { $set: { provider } },
  )
  refundsStamped += result.modifiedCount
}

console.log(
  `payments: ${renamedPayments} renamed, ${cash.modifiedCount} cash, ${card.modifiedCount} card`,
)
console.log(`refunds : ${renamedRefunds} renamed, ${refundsStamped} stamped`)

await disconnectDatabase()
