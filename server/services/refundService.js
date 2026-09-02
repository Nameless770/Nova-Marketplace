import mongoose from 'mongoose'
import { logger } from '../utils/logger.js'
import Stripe from 'stripe'
import { Inventory } from '../models/Inventory.js'
import { InventoryHistory } from '../models/InventoryHistory.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Payment } from '../models/Payment.js'
import { Refund } from '../models/Refund.js'
import { Seller } from '../models/Seller.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { AppError } from '../utils/errors.js'
import { AUDIT, recordAudit } from './auditService.js'

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new AppError(503, 'PAYMENTS_NOT_CONFIGURED', 'Stripe is not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

function refundNumber() {
  return `RFN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function requireIdempotencyKey(value) {
  const key = value?.trim()
  if (!key || key.length > 160)
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required')
  return key
}

async function existingRefundForKey(idempotencyKey) {
  return Refund.findOne({ idempotencyKey }).lean()
}

/**
 * Resolves what the caller is allowed to refund.
 *
 * Admins may refund the whole order. A seller may only refund their own
 * SellerOrder, and only up to that SellerOrder's total — never the whole order
 * and never another seller's portion.
 */
async function resolveRefundScope(user, orderId, session) {
  if (!mongoose.isValidObjectId(orderId))
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')

  const order = await Order.findById(orderId).session(session)
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')

  if (user.role === 'admin') {
    return { order, sellerOrder: null, seller: null, ceilingMinor: order.totalMinor }
  }

  const seller = await Seller.findOne({ ownerUserId: user._id, status: 'approved' })
    .session(session)
    .lean()
  if (!seller) throw new AppError(403, 'SELLER_NOT_APPROVED', 'Seller is not approved')

  const sellerOrder = await SellerOrder.findOne({ orderId: order._id, sellerId: seller._id })
    .session(session)
    .lean()
  if (!sellerOrder)
    throw new AppError(404, 'SELLER_ORDER_NOT_FOUND', 'No seller order found for this order')

  return { order, sellerOrder, seller, ceilingMinor: sellerOrder.totalMinor }
}

// A seller's ceiling is their own SellerOrder total minus what they already refunded.
async function alreadyRefundedForScope(orderId, sellerOrderId, session) {
  const match = { orderId, status: { $in: ['pending', 'succeeded'] } }
  if (sellerOrderId) match.sellerOrderId = sellerOrderId
  const [row] = await Refund.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amountMinor' } } },
  ]).session(session)
  return row?.total ?? 0
}

/**
 * Splits a refund across the sellers who bear it.
 *
 * A seller refunding their own portion produces one allocation. An admin
 * refunding a multi-vendor order splits proportionally by SellerOrder total,
 * with the rounding remainder going to the last seller — the same allocation
 * rule orderService already uses for order-level coupon discounts, so the parts
 * always sum exactly to the whole.
 */
async function allocateRefund(order, sellerOrder, amountMinor, session) {
  if (sellerOrder) {
    return [{ sellerId: sellerOrder.sellerId, sellerOrderId: sellerOrder._id, amountMinor }]
  }

  const sellerOrders = await SellerOrder.find({ orderId: order._id }).session(session).lean()
  if (sellerOrders.length === 0) return []
  if (sellerOrders.length === 1) {
    return [
      {
        sellerId: sellerOrders[0].sellerId,
        sellerOrderId: sellerOrders[0]._id,
        amountMinor,
      },
    ]
  }

  const basis = sellerOrders.reduce((total, item) => total + item.totalMinor, 0)
  if (basis <= 0) return []

  let allocated = 0
  return sellerOrders.map((item, index) => {
    const share =
      index === sellerOrders.length - 1
        ? amountMinor - allocated
        : Math.floor((amountMinor * item.totalMinor) / basis)
    allocated += share
    return { sellerId: item.sellerId, sellerOrderId: item._id, amountMinor: share }
  })
}

async function restockRefundedItems(refund, session) {
  for (const item of refund.items) {
    const orderItem = await OrderItem.findById(item.orderItemId).session(session).lean()
    if (!orderItem) continue

    const inventory = await Inventory.findOneAndUpdate(
      { variantId: orderItem.variantId, sellerId: orderItem.sellerId },
      { $inc: { quantityOnHand: item.quantity, version: 1 } },
      { new: true, session },
    )
    if (!inventory) continue

    inventory.quantityAvailable = inventory.quantityOnHand - inventory.quantityReserved
    inventory.isLowStock = inventory.quantityAvailable <= inventory.lowStockThreshold
    inventory.status = inventory.quantityAvailable === 0 ? 'out_of_stock' : 'active'
    await inventory.save({ session })

    const commandId = `${refund._id.toString()}:${item.orderItemId.toString()}:restock`
    const prior = await InventoryHistory.findOne({ commandId }).session(session).lean()
    if (prior) continue

    await InventoryHistory.create(
      [
        {
          inventoryId: inventory._id,
          sellerId: orderItem.sellerId,
          variantId: orderItem.variantId,
          commandId,
          type: 'add',
          quantity: item.quantity,
          quantityOnHandAfter: inventory.quantityOnHand,
          quantityReservedAfter: inventory.quantityReserved,
          reason: `Refund ${refund.refundNumber}`,
        },
      ],
      { session },
    )
  }
}

/**
 * Records a refund and atomically reserves the amount against the payment.
 *
 * The money is not moved here — Stripe is called after the transaction commits
 * and the refund is only marked succeeded by a verified webhook. This ordering
 * means a crash can leave a `pending` refund (recoverable) but can never move
 * money that was not first reserved against the payment.
 */
export async function createRefund(user, orderId, input, idempotencyKey) {
  const key = requireIdempotencyKey(idempotencyKey)

  const replay = await existingRefundForKey(key)
  if (replay) return { refund: replay, idempotentReplay: true }

  const amountMinor = input.amountMinor
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1)
    throw new AppError(400, 'INVALID_REFUND_AMOUNT', 'amountMinor must be a positive integer')
  if (typeof input.reason !== 'string' || !input.reason.trim())
    throw new AppError(400, 'REFUND_REASON_REQUIRED', 'A refund reason is required')

  const session = await mongoose.startSession()
  try {
    let created
    await session.withTransaction(async () => {
      const { order, sellerOrder, seller, ceilingMinor } = await resolveRefundScope(
        user,
        orderId,
        session,
      )

      const payment = await Payment.findOne({ orderId: order._id, status: { $ne: 'failed' } })
        .sort({ createdAt: -1 })
        .session(session)
      if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'No payment found for this order')
      if (!['paid', 'partially_refunded'].includes(payment.status))
        throw new AppError(409, 'PAYMENT_NOT_REFUNDABLE', 'This payment cannot be refunded')

      // Scope ceiling: a seller may never exceed their own SellerOrder total.
      const scopeRefunded = await alreadyRefundedForScope(
        order._id,
        sellerOrder?._id ?? null,
        session,
      )
      if (scopeRefunded + amountMinor > ceilingMinor)
        throw new AppError(
          409,
          'REFUND_EXCEEDS_REFUNDABLE',
          'Refund amount exceeds the refundable balance',
        )

      const refundItems = []
      if (Array.isArray(input.items) && input.items.length) {
        for (const line of input.items) {
          const orderItem = await OrderItem.findOne({
            _id: line.orderItemId,
            orderId: order._id,
            ...(sellerOrder ? { sellerOrderId: sellerOrder._id } : {}),
          })
            .session(session)
            .lean()
          if (!orderItem)
            throw new AppError(404, 'ORDER_ITEM_NOT_FOUND', 'Order item not found on this order')
          if (!Number.isSafeInteger(line.quantity) || line.quantity < 1)
            throw new AppError(400, 'INVALID_REFUND_QUANTITY', 'Refund quantity must be positive')
          if (line.quantity > orderItem.quantity)
            throw new AppError(
              409,
              'REFUND_QUANTITY_EXCEEDS_ORDER',
              'Refund quantity exceeds the quantity ordered',
            )
          refundItems.push({
            orderItemId: orderItem._id,
            quantity: line.quantity,
            amountMinor: orderItem.unitPriceMinor * line.quantity,
          })
        }
      }

      // Atomic guard against concurrent refunds: only succeeds while the running
      // refunded total plus this amount stays within the captured amount.
      const guarded = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          status: { $in: ['paid', 'partially_refunded'] },
          $expr: { $lte: [{ $add: ['$refundedMinor', amountMinor] }, '$amountMinor'] },
        },
        { $inc: { refundedMinor: amountMinor } },
        { new: true, session },
      )
      if (!guarded)
        throw new AppError(
          409,
          'REFUND_EXCEEDS_REFUNDABLE',
          'Refund amount exceeds the refundable balance',
        )

      guarded.status =
        guarded.refundedMinor >= guarded.amountMinor ? 'refunded' : 'partially_refunded'
      await guarded.save({ session })

      const nextOrderRefunded = order.refundedMinor + amountMinor
      order.refundedMinor = nextOrderRefunded
      order.paymentStatus =
        nextOrderRefunded >= order.totalMinor ? 'refunded' : 'partially_refunded'
      if (nextOrderRefunded >= order.totalMinor) order.status = 'refunded'
      await order.save({ session })

      const allocations = await allocateRefund(order, sellerOrder, amountMinor, session)

      const [refund] = await Refund.create(
        [
          {
            refundNumber: refundNumber(),
            orderId: order._id,
            sellerOrderId: sellerOrder?._id,
            sellerId: seller?._id ?? sellerOrder?.sellerId,
            allocations,
            paymentId: payment._id,
            customerId: order.customerId,
            initiatedBy: user._id,
            initiatorRole: user.role === 'admin' ? 'admin' : 'seller',
            amountMinor,
            currency: order.currency,
            reason: input.reason.trim(),
            restock: Boolean(input.restock),
            items: refundItems,
            // A refund follows the payment it reverses.
            provider: payment.provider ?? 'cash',
            idempotencyKey: key,
          },
        ],
        { session },
      )
      // Money movement is the action most worth being able to reconstruct later.
      await recordAudit(
        {
          actorId: user._id,
          actorRole: user.role === 'admin' ? 'admin' : 'seller',
          action: AUDIT.REFUND_CREATED,
          targetType: 'Order',
          targetId: order._id,
          after: {
            refundNumber: refund.refundNumber,
            amountMinor,
            currency: order.currency,
            restock: Boolean(input.restock),
          },
          reason: input.reason.trim(),
          ip: input.ip,
        },
        session,
      )

      created = refund.toObject()
    })
    return { refund: created, idempotentReplay: false }
  } catch (error) {
    if (error.code === 11000) {
      const replayed = await existingRefundForKey(key)
      if (replayed) return { refund: replayed, idempotentReplay: true }
    }
    throw error
  } finally {
    await session.endSession()
  }
}

/**
 * Moves a recorded refund toward settlement, by whichever route its payment
 * used. Separate from createRefund so the database transaction never spans a
 * network call.
 *
 * A **cash** refund has no processor: the money is handed back at the door, so
 * the record is the settlement and it completes immediately. A **stripe** refund
 * is submitted to the processor and settles later on its webhook.
 */
export async function submitRefundToProvider(refundId) {
  const refund = await Refund.findById(refundId)
  if (!refund) throw new AppError(404, 'REFUND_NOT_FOUND', 'Refund not found')
  if (refund.status !== 'pending') return refund.toObject()
  if (refund.providerRefundId) return refund.toObject()

  const payment = await Payment.findById(refund.paymentId).lean()
  const provider = refund.provider ?? payment?.provider ?? 'cash'

  if (provider === 'cash') {
    // Stamp the reference first so settlement can find the refund by the same
    // unique key a provider id would occupy — that index is what keeps a repeat
    // call idempotent.
    refund.providerRefundId = cashRefundReference(refund)
    await refund.save()
    // Settled through the same idempotent path a webhook would use, so restock
    // and bookkeeping behave identically however the money moved.
    await applyRefundEvent(refund.providerRefundId, 'succeeded')
    return (await Refund.findById(refundId).lean()) ?? refund.toObject()
  }

  if (!payment?.providerPaymentIntentId)
    throw new AppError(409, 'PAYMENT_INTENT_MISSING', 'Payment has no provider payment intent')

  const stripe = stripeClient()
  const providerRefund = await stripe.refunds.create(
    {
      payment_intent: payment.providerPaymentIntentId,
      amount: refund.amountMinor,
      metadata: { refundId: refund._id.toString(), refundNumber: refund.refundNumber },
    },
    { idempotencyKey: refund.idempotencyKey },
  )

  refund.providerRefundId = providerRefund.id
  await refund.save()
  return refund.toObject()
}

// A cash refund still needs a stable reference so `applyRefundEvent` can find it
// and so the unique index keeps settlement idempotent.
function cashRefundReference(refund) {
  return `cash_${refund._id}`
}

// Stripe's own refund states, mapped onto the two outcomes this service knows.
// `pending` and `requires_action` are still in flight and are left alone.
const PROVIDER_OUTCOME = {
  succeeded: 'succeeded',
  failed: 'failed',
  canceled: 'failed',
}

/**
 * Re-drives refunds that are stuck in `pending`.
 *
 * A refund reaches a terminal state through a provider webhook. If that webhook
 * is never delivered, or the provider call failed after `createRefund` already
 * committed, the refund stays `pending` forever with the customer's money
 * reserved and nothing retrying it. This closes that gap.
 *
 * Two distinct stalls are handled:
 *   - never submitted (`providerRefundId` unset) -> submit it now
 *   - submitted but unsettled                  -> ask the provider and apply
 *
 * Everything it calls is idempotent, so a duplicate run cannot double-refund.
 *
 * NOTE: this is safe but not free to run on every replica. Above one instance it
 * belongs in a single-owner CronJob rather than an in-process interval.
 */
export async function reconcilePendingRefunds({ olderThanMs = 15 * 60 * 1000, limit = 50 } = {}) {
  const summary = { examined: 0, submitted: 0, settled: 0, stillPending: 0, failed: 0 }

  // `updatedAt` rather than `createdAt`: a refund touched moments ago is still
  // travelling its normal path and should be left to finish.
  const stale = await Refund.find({
    status: 'pending',
    updatedAt: { $lt: new Date(Date.now() - olderThanMs) },
  })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean()

  // Cash refunds never need the processor, so they are recovered even when no
  // Stripe key is configured. Card refunds are skipped rather than failed.
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY)
  const stripe = stripeConfigured ? stripeClient() : null

  for (const refund of stale) {
    const provider = refund.provider ?? 'cash'
    if (provider === 'stripe' && !stripeConfigured) {
      summary.stillPending += 1
      continue
    }
    summary.examined += 1
    try {
      if (!refund.providerRefundId) {
        await submitRefundToProvider(refund._id)
        summary.submitted += 1
        continue
      }
      if (provider === 'cash') {
        // Reference stamped but never settled — finish it.
        await applyRefundEvent(refund.providerRefundId, 'succeeded')
        summary.settled += 1
        continue
      }
      const providerRefund = await stripe.refunds.retrieve(refund.providerRefundId)
      const outcome = PROVIDER_OUTCOME[providerRefund.status]
      if (!outcome) {
        summary.stillPending += 1
        continue
      }
      await applyRefundEvent(refund.providerRefundId, outcome)
      summary.settled += 1
    } catch (error) {
      // One bad refund must not stop the batch — the next run retries it.
      summary.failed += 1
      logger.error({ err: error, refundNumber: refund.refundNumber }, 'refund reconcile failed')
    }
  }
  return summary
}

/**
 * Applies a verified Stripe refund event. Idempotent: a refund already in a
 * terminal state is left untouched so duplicate webhook deliveries are safe.
 */
export async function applyRefundEvent(providerRefundId, outcome) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      const refund = await Refund.findOne({ providerRefundId }).session(session)
      if (!refund) throw new AppError(404, 'REFUND_NOT_FOUND', 'Refund not found')
      if (refund.status !== 'pending') {
        result = refund.toObject()
        return
      }

      if (outcome === 'succeeded') {
        refund.status = 'succeeded'
        refund.processedAt = new Date()
        if (refund.restock && refund.items.length) {
          await restockRefundedItems(refund, session)
          refund.restockedAt = new Date()
        }
      } else {
        // Release the reserved amount so the money becomes refundable again.
        refund.status = 'failed'
        refund.failureReason = 'Provider reported the refund failed'
        const payment = await Payment.findOneAndUpdate(
          { _id: refund.paymentId, refundedMinor: { $gte: refund.amountMinor } },
          { $inc: { refundedMinor: -refund.amountMinor } },
          { new: true, session },
        )
        if (payment) {
          payment.status = payment.refundedMinor === 0 ? 'paid' : 'partially_refunded'
          await payment.save({ session })
        }
        const order = await Order.findById(refund.orderId).session(session)
        if (order) {
          order.refundedMinor = Math.max(0, order.refundedMinor - refund.amountMinor)
          order.paymentStatus = order.refundedMinor === 0 ? 'paid' : 'partially_refunded'
          if (order.status === 'refunded') order.status = 'delivered'
          await order.save({ session })
        }
      }

      await refund.save({ session })
      result = refund.toObject()
    })
    return result
  } finally {
    await session.endSession()
  }
}

export async function listOrderRefunds(user, orderId) {
  if (!mongoose.isValidObjectId(orderId))
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')

  const filter = { orderId }
  if (user.role === 'seller') {
    const seller = await Seller.findOne({ ownerUserId: user._id }).select('_id').lean()
    if (!seller) throw new AppError(403, 'SELLER_NOT_APPROVED', 'Seller is not approved')
    filter.sellerId = seller._id
  } else if (user.role === 'customer') {
    const order = await Order.findOne({ _id: orderId, customerId: user._id }).select('_id').lean()
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')
  }

  const refunds = await Refund.find(filter).sort({ createdAt: -1, _id: -1 }).limit(50).lean()
  return { items: refunds }
}

export async function refundableSummary(user, orderId) {
  const session = null
  const { order, sellerOrder, ceilingMinor } = await resolveRefundScope(user, orderId, session)
  const alreadyRefunded = await alreadyRefundedForScope(
    order._id,
    sellerOrder?._id ?? null,
    session,
  )
  return {
    orderId: order._id,
    currency: order.currency,
    scope: sellerOrder ? 'seller_order' : 'order',
    ceilingMinor,
    refundedMinor: alreadyRefunded,
    refundableMinor: Math.max(0, ceilingMinor - alreadyRefunded),
  }
}
