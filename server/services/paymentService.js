import mongoose from 'mongoose'
import Stripe from 'stripe'
import { Inventory } from '../models/Inventory.js'
import { InventoryHistory } from '../models/InventoryHistory.js'
import { InventoryReservation } from '../models/InventoryReservation.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Payment } from '../models/Payment.js'
import { WebhookEvent } from '../models/WebhookEvent.js'
import { AppError } from '../utils/errors.js'
import { applyRedemption, releaseRedemptions } from './couponService.js'

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
      sessionId: existing.stripeSessionId,
      url: existing.stripeCheckoutUrl,
    }
  }

  const items = await OrderItem.find({ orderId }).lean()
  if (!items.length) throw new AppError(409, 'ORDER_EMPTY', 'Order has no items')
  const stripe = stripeClient()
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: item.unitPriceMinor,
          product_data: { name: `${item.productSnapshot.title} - ${item.variantSnapshot.name}` },
        },
      })),
      metadata: { orderId: order._id.toString(), customerId: customerId.toString() },
      success_url: process.env.PAYMENT_SUCCESS_URL,
      cancel_url: process.env.PAYMENT_CANCEL_URL,
    },
    { idempotencyKey: key },
  )
  const payment = await Payment.create({
    orderId,
    customerId,
    stripeSessionId: session.id,
    stripeCheckoutUrl: session.url,
    stripePaymentIntentId: session.payment_intent ?? undefined,
    amountMinor: order.totalMinor,
    currency: order.currency,
    idempotencyKey: key,
  })
  return { payment, sessionId: session.id, url: session.url }
}

export async function getPayment(customerId, orderId) {
  const order = await Order.findOne({ _id: orderId, customerId }).select('_id').lean()
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')
  return Payment.findOne({ orderId }).sort({ createdAt: -1 }).lean()
}

export async function getPaymentByCheckoutSession(customerId, stripeSessionId) {
  if (!stripeSessionId || stripeSessionId.length > 255)
    throw new AppError(400, 'INVALID_SESSION_ID', 'Invalid checkout session')

  const payment = await Payment.findOne({ stripeSessionId, customerId }).lean()
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

async function applyPaymentEvent(event) {
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ stripeSessionId: event.data.object.id }).session(
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
    await applyPaymentEvent(event)
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
