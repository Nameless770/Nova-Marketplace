import mongoose from 'mongoose'
import { logger } from '../utils/logger.js'
import Stripe from 'stripe'
import { Inventory } from '../models/Inventory.js'
import { InventoryHistory } from '../models/InventoryHistory.js'
import { InventoryReservation } from '../models/InventoryReservation.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Payment } from '../models/Payment.js'
import { Seller } from '../models/Seller.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { WebhookEvent } from '../models/WebhookEvent.js'
import { AppError } from '../utils/errors.js'
import { applyRedemption, releaseRedemptions } from './couponService.js'
import { notifyNewSellerOrder, notifyOrderConfirmation } from './notificationService.js'

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new AppError(503, 'PAYMENTS_NOT_CONFIGURED', 'Stripe is not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

function requiredIdempotencyKey(value) {
  if (!value || value.length > 160)
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required')
  return value
}

export async function createCheckoutSession(customerId, orderId, idempotencyKey) {
  const key = requiredIdempotencyKey(idempotencyKey)
  if (!mongoose.isValidObjectId(orderId))
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')
  const order = await Order.findOne({ _id: orderId, customerId }).lean()
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')
  if (order.paymentStatus !== 'pending' || !['pending', 'confirmed'].includes(order.status))
    throw new AppError(409, 'ORDER_NOT_PAYABLE', 'Order is not payable')

  const existing = await Payment.findOne({ idempotencyKey: key }).lean()
  if (existing) {
    if (existing.orderId.toString() !== orderId)
      throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to another order')
    return {
      payment: existing,
      sessionId: existing.providerSessionId,
      url: existing.providerCheckoutUrl,
    }
  }

  const items = await OrderItem.find({ orderId }).lean()
  if (!items.length) throw new AppError(409, 'ORDER_EMPTY', 'Order has no items')

  // No external payment processor: record the payment and settle it right away,
  // running the same commit path a confirmed Stripe webhook used to trigger.
  // The success URL points the customer straight at the confirmation page.
  const sessionId = `local_${crypto.randomUUID()}`
  const successUrl = (
    process.env.PAYMENT_SUCCESS_URL ||
    'http://localhost:5173/payment/success?session_id={CHECKOUT_SESSION_ID}'
  ).replace('{CHECKOUT_SESSION_ID}', sessionId)

  const payment = await Payment.create({
    orderId,
    customerId,
    provider: 'cash',
    providerSessionId: sessionId,
    providerCheckoutUrl: successUrl,
    amountMinor: order.totalMinor,
    currency: order.currency,
    idempotencyKey: key,
  })
  await settlePaymentPaid(payment._id)
  const settled = await Payment.findById(payment._id).lean()
  return { payment: settled, sessionId, url: successUrl }
}

// Marks a pending payment (and its order) paid in one transaction, committing the
// held inventory and redeeming any coupon — the same work the Stripe
// `checkout.session.completed` webhook did, now that checkout settles locally.
async function settlePaymentPaid(paymentId) {
  // Captured inside the transaction, acted on only after it commits.
  let settled = null
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(session)
      if (!payment || payment.status === 'paid') return
      const order = await Order.findById(payment.orderId).session(session)
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')
      settled = { orderId: order._id, customerId: order.customerId }
      await finalizeReservations(order._id, 'commit', session)
      await applyRedemption(order._id, session)
      payment.status = 'paid'
      payment.paidAt = new Date()
      order.paymentStatus = 'paid'
      order.status = 'confirmed'
      order.placedAt = new Date()
      // First real step on the customer's tracking timeline.
      order.statusHistory.push({ status: 'confirmed', at: new Date() })
      // Payment confirms the whole order, so each seller's portion moves out of
      // `pending` too — otherwise the seller cannot begin fulfilling it.
      await SellerOrder.updateMany(
        { orderId: order._id, status: 'pending' },
        { $set: { status: 'confirmed' } },
        { session },
      )
      await payment.save({ session })
      await order.save({ session })
    })
  } finally {
    await session.endSession()
  }

  // Emitted only after the transaction has committed. A notification for an
  // order that was rolled back is worse than no notification, and the helpers
  // are idempotent on `eventKey`, so a retry cannot duplicate them.
  if (settled) await announceOrderConfirmed(settled.orderId, settled.customerId)
}

/**
 * Tells the customer their order is confirmed, and each seller that they have
 * work to do. Failure here must never fail a payment that already succeeded, so
 * problems are logged rather than thrown.
 */
async function announceOrderConfirmed(orderId, customerId) {
  try {
    await notifyOrderConfirmation(customerId, orderId)

    const sellerOrders = await SellerOrder.find({ orderId }).select('_id sellerId').lean()
    const sellers = await Seller.find({ _id: { $in: sellerOrders.map((item) => item.sellerId) } })
      .select('_id ownerUserId')
      .lean()
    const ownerBySeller = new Map(sellers.map((item) => [item._id.toString(), item.ownerUserId]))

    await Promise.all(
      sellerOrders.map((sellerOrder) => {
        const ownerUserId = ownerBySeller.get(sellerOrder.sellerId.toString())
        return ownerUserId ? notifyNewSellerOrder(ownerUserId, sellerOrder._id) : null
      }),
    )
  } catch (error) {
    logger.error({ err: error, orderId: String(orderId) }, 'order confirmation notification failed')
  }
}

export async function getPayment(customerId, orderId) {
  const order = await Order.findOne({ _id: orderId, customerId }).select('_id').lean()
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')
  return Payment.findOne({ orderId }).sort({ createdAt: -1 }).lean()
}

export async function getPaymentByCheckoutSession(customerId, providerSessionId) {
  if (!providerSessionId || providerSessionId.length > 255)
    throw new AppError(400, 'INVALID_SESSION_ID', 'Invalid checkout session')

  const payment = await Payment.findOne({ providerSessionId, customerId }).lean()
  if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record not found')

  const order = await Order.findOne({ _id: payment.orderId, customerId }).lean()
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')

  return { payment, order }
}

async function finalizeReservations(orderId, action, session) {
  const reservations = await InventoryReservation.find({ orderId, status: 'active' }).session(
    session,
  )
  for (const reservation of reservations) {
    const inventory =
      action === 'commit'
        ? await Inventory.findOneAndUpdate(
            {
              _id: reservation.inventoryId,
              quantityReserved: { $gte: reservation.quantity },
              quantityOnHand: { $gte: reservation.quantity },
            },
            {
              $inc: {
                quantityReserved: -reservation.quantity,
                quantityOnHand: -reservation.quantity,
                version: 1,
              },
            },
            { new: true, session },
          )
        : await Inventory.findOneAndUpdate(
            { _id: reservation.inventoryId, quantityReserved: { $gte: reservation.quantity } },
            { $inc: { quantityReserved: -reservation.quantity, version: 1 } },
            { new: true, session },
          )
    if (!inventory)
      throw new AppError(409, 'INVALID_RESERVATION', 'Inventory reservation cannot be finalized')
    inventory.quantityAvailable = inventory.quantityOnHand - inventory.quantityReserved
    inventory.isLowStock = inventory.quantityAvailable <= inventory.lowStockThreshold
    inventory.status = inventory.quantityAvailable === 0 ? 'out_of_stock' : 'active'
    await inventory.save({ session })
    reservation.status = action === 'commit' ? 'committed' : 'released'
    reservation.releasedAt = new Date()
    await reservation.save({ session })
    await InventoryHistory.create(
      [
        {
          inventoryId: inventory._id,
          sellerId: reservation.sellerId,
          variantId: reservation.variantId,
          commandId: `${reservation.reservationKey}:${action}`,
          type: action === 'commit' ? 'confirm' : 'release',
          quantity: reservation.quantity,
          quantityOnHandAfter: inventory.quantityOnHand,
          quantityReservedAfter: inventory.quantityReserved,
          reservationId: reservation._id,
        },
      ],
      { session },
    )
  }
}

const REFUND_EVENTS = {
  'refund.updated': true,
  'charge.refund.updated': true,
  'refund.failed': false,
  'charge.refund.failed': false,
}

async function applyRefundWebhook(event) {
  const { applyRefundEvent } = await import('./refundService.js')
  const object = event.data.object
  const providerRefundId = object.id
  const succeeded = REFUND_EVENTS[event.type] && object.status === 'succeeded'
  await applyRefundEvent(providerRefundId, succeeded ? 'succeeded' : 'failed')
}

async function applyPaymentEvent(event) {
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ providerSessionId: event.data.object.id }).session(
        session,
      )
      if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record not found')
      const success =
        event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid'
      const order = await Order.findById(payment.orderId).session(session)
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')
      if (success && payment.status !== 'paid') {
        await finalizeReservations(order._id, 'commit', session)
        await applyRedemption(order._id, session)
        payment.status = 'paid'
        payment.paidAt = new Date()
        order.paymentStatus = 'paid'
        order.status = 'confirmed'
        order.placedAt = new Date()
      } else if (
        !success &&
        ['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(
          event.type,
        ) &&
        payment.status === 'pending'
      ) {
        await finalizeReservations(order._id, 'release', session)
        await releaseRedemptions(order._id, session)
        payment.status = event.type === 'checkout.session.expired' ? 'expired' : 'failed'
        order.paymentStatus = 'failed'
        order.status = 'cancelled'
      }
      await payment.save({ session })
      await order.save({ session })
    })
  } finally {
    await session.endSession()
  }
}

export async function handleStripeWebhook(rawBody, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'Stripe webhook is not configured')
  let event
  try {
    event = stripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    )
  } catch {
    throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Stripe webhook signature')
  }
  const existing = await WebhookEvent.findOne({ provider: 'stripe', eventId: event.id }).lean()
  if (existing?.status === 'processed') return { received: true, duplicate: true }
  if (!existing)
    await WebhookEvent.create({
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      status: 'processing',
    })
  try {
    if (event.type in REFUND_EVENTS) await applyRefundWebhook(event)
    else await applyPaymentEvent(event)
    await WebhookEvent.updateOne(
      { provider: 'stripe', eventId: event.id },
      { $set: { status: 'processed', processedAt: new Date() } },
    )
  } catch (error) {
    await WebhookEvent.updateOne(
      { provider: 'stripe', eventId: event.id },
      { $set: { status: 'failed', errorMessage: error.message } },
    )
    throw error
  }
  return { received: true }
}
