import request from 'supertest'
import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryReservation } from '../models/InventoryReservation.js'
import { Order } from '../models/Order.js'
import { Payment } from '../models/Payment.js'
import { WebhookEvent } from '../models/WebhookEvent.js'
import { address, createCatalogItem, createUser } from './factories.js'

function signedHeader(payload) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  })
}

async function createPayableOrder() {
  const customer = await createUser()
  const item = await createCatalogItem({ quantityOnHand: 2, priceMinor: 1000 })
  await Inventory.findByIdAndUpdate(item.inventory._id, {
    $set: { quantityReserved: 1, quantityAvailable: 1 },
  })
  const order = await Order.create({
    orderNumber: 'ORD-WEBHOOK',
    idempotencyKey: 'webhook-order-key',
    customerId: customer._id,
    sellerIds: [item.seller._id],
    currency: 'USD',
    subtotalMinor: 1000,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 1000,
    shippingAddressSnapshot: address,
    billingAddressSnapshot: address,
  })
  await InventoryReservation.create({
    reservationKey: `${order._id}:${item.variant._id}`,
    orderId: order._id,
    inventoryId: item.inventory._id,
    sellerId: item.seller._id,
    variantId: item.variant._id,
    quantity: 1,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  })
  const payment = await Payment.create({
    orderId: order._id,
    customerId: customer._id,
    providerSessionId: 'cs_test_webhook',
    providerCheckoutUrl: 'https://checkout.stripe.test/session',
    amountMinor: 1000,
    currency: 'USD',
    idempotencyKey: 'payment-webhook-key',
  })

  return { customer, item, order, payment }
}

describe('stripe webhook processing', () => {
  it('rejects invalid webhook signatures', async () => {
    const payload = JSON.stringify({ id: 'evt_invalid', type: 'checkout.session.completed' })

    const response = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Stripe-Signature', 'bad-signature')
      .set('Content-Type', 'application/json')
      .send(payload)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
  })

  it('processes a valid checkout completion webhook', async () => {
    const { item, order, payment } = await createPayableOrder()
    const payload = JSON.stringify({
      id: 'evt_completed',
      type: 'checkout.session.completed',
      data: { object: { id: payment.providerSessionId, payment_status: 'paid' } },
    })

    const response = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Stripe-Signature', signedHeader(payload))
      .set('Content-Type', 'application/json')
      .send(payload)

    expect(response.status).toBe(200)
    await expect(Payment.findById(payment._id).lean()).resolves.toMatchObject({ status: 'paid' })
    await expect(Order.findById(order._id).lean()).resolves.toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
    })
    await expect(InventoryReservation.countDocuments({ status: 'committed' })).resolves.toBe(1)
    await expect(Inventory.findById(item.inventory._id).lean()).resolves.toMatchObject({
      quantityOnHand: 1,
      quantityReserved: 0,
      quantityAvailable: 1,
    })
  })

  it('handles duplicate webhook events idempotently', async () => {
    const { payment } = await createPayableOrder()
    const payload = JSON.stringify({
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: { object: { id: payment.providerSessionId, payment_status: 'paid' } },
    })
    const signature = signedHeader(payload)

    const first = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Stripe-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
    const second = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Stripe-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.data.duplicate).toBe(true)
    await expect(WebhookEvent.countDocuments({ eventId: 'evt_duplicate' })).resolves.toBe(1)
    await expect(InventoryReservation.countDocuments({ status: 'committed' })).resolves.toBe(1)
  })
})
