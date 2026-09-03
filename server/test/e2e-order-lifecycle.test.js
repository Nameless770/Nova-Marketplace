import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { resetAllRateLimits } from '../middleware/rateLimit.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryReservation } from '../models/InventoryReservation.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Payment } from '../models/Payment.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { authHeader, createApprovedSeller, createCatalogItem, createUser } from './factories.js'

/**
 * End-to-end order lifecycle.
 *
 * Every other suite calls a service directly. This one drives the whole journey
 * over real HTTP — routers, authenticate/authorize, the idempotency guards, the
 * controllers, the transactions, MongoDB — because the defects that survive
 * per-feature tests live in the seams between features: money crossing from cart
 * to order to payment to refund, stock moving from reserved to committed, and
 * the status a customer tracks rolling up out of each seller's portion.
 *
 * The customer is registered through the API, because that path is part of the
 * journey. Sellers and admins are built by factories: they are actors here, not
 * the flow under test, and seller onboarding is its own review journey.
 */

// Checkout captures a map pin rather than a typed address, so coordinates are
// what the real client sends.
const deliveryPoint = { latitude: 30.0444, longitude: 31.2357, country: 'EG' }

let emailSequence = 0

async function registerCustomer() {
  emailSequence += 1
  const email = `journey-buyer-${emailSequence}@example.com`
  const password = 'Password123!'

  const registered = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Nova', lastName: 'Buyer' })
  expect(registered.status).toBe(201)

  // Logging in separately proves the credential survived hashing rather than
  // just trusting the token registration handed back.
  const loggedIn = await request(app).post('/api/v1/auth/login').send({ email, password })
  expect(loggedIn.status).toBe(200)

  return {
    email,
    token: `Bearer ${loggedIn.body.data.accessToken}`,
    userId: loggedIn.body.data.user.id ?? loggedIn.body.data.user._id,
  }
}

/**
 * Fast-forwards to a paid order the way a customer actually gets one: register,
 * add to cart, check out, pay. Returns every handle the assertions need.
 */
async function placePaidOrder({ quantityOnHand = 5, priceMinor = 2500, quantity = 2 } = {}) {
  const catalogue = await createCatalogItem({ quantityOnHand, priceMinor })
  const customer = await registerCustomer()

  await request(app)
    .post('/api/v1/cart/items')
    .set('Authorization', customer.token)
    .send({
      productId: catalogue.product._id.toString(),
      variantId: catalogue.variant._id.toString(),
      quantity,
    })
    .expect(201)

  const checkout = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', customer.token)
    .set('Idempotency-Key', `journey-checkout-${emailSequence}`)
    .send({ shippingAddress: deliveryPoint })
  expect(checkout.status).toBe(201)

  const orderId = checkout.body.data.order._id
  const payment = await request(app)
    .post(`/api/v1/payments/orders/${orderId}/checkout-session`)
    .set('Authorization', customer.token)
    .set('Idempotency-Key', `journey-payment-${emailSequence}`)
  expect(payment.status).toBe(201)

  return { catalogue, customer, orderId, order: checkout.body.data.order, payment: payment.body }
}

async function sellerOrderIdFor(sellerOwner) {
  const listed = await request(app)
    .get('/api/v1/orders/seller/list')
    .set('Authorization', authHeader(sellerOwner))
    .expect(200)
  return listed.body.data.items[0]._id
}

beforeEach(() => {
  // Buckets are in-process and survive the collection wipe, so without this the
  // registrations in this file would eventually trip the 10/hour sign-up limit.
  resetAllRateLimits()
})

describe('order lifecycle end to end', () => {
  it('carries a customer from registration to a delivered order', async () => {
    const catalogue = await createCatalogItem({ quantityOnHand: 5, priceMinor: 2500 })
    const customer = await registerCustomer()

    // --- identity -----------------------------------------------------------
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', customer.token)
      .expect(200)
    expect(me.body.data.user.email).toBe(customer.email)

    // --- browsing is public -------------------------------------------------
    const browse = await request(app).get('/api/v1/products').expect(200)
    expect(browse.body.data.items.length).toBeGreaterThan(0)

    await request(app).get(`/api/v1/products/${catalogue.product._id}`).expect(200)

    // --- cart ---------------------------------------------------------------
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', customer.token)
      .send({
        productId: catalogue.product._id.toString(),
        variantId: catalogue.variant._id.toString(),
        quantity: 2,
      })
      .expect(201)

    const cart = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', customer.token)
      .expect(200)
    expect(cart.body.data.cart.items).toHaveLength(1)

    // The seller reprices AND discounts between the cart and the checkout. Two
    // things have to hold: a cart is a wish rather than a quote, so the stale
    // 2500 must not survive; and the effective price is what the customer pays,
    // so capturing the 3000 list price instead of the 2700 sale price is just as
    // wrong. Keeping the two numbers different is what makes this test able to
    // tell those apart.
    await ProductVariant.updateOne(
      { _id: catalogue.variant._id },
      { $set: { priceMinor: 3000, discountPercent: 10, currentPriceMinor: 2700 } },
    )

    // --- checkout -----------------------------------------------------------
    const checkout = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', customer.token)
      .set('Idempotency-Key', 'journey-checkout')
      .send({ shippingAddress: deliveryPoint })
      .expect(201)

    const order = checkout.body.data.order
    expect(checkout.body.data.items[0].unitPriceMinor).toBe(2700)
    expect(order.subtotalMinor).toBe(5400)
    // Money is integer minor units everywhere it crosses the wire.
    for (const amount of [order.subtotalMinor, order.totalMinor]) {
      expect(Number.isSafeInteger(amount)).toBe(true)
    }

    // Stock is held, not yet taken: the customer has not paid.
    await expect(Inventory.findById(catalogue.inventory._id).lean()).resolves.toMatchObject({
      quantityOnHand: 5,
      quantityReserved: 2,
      quantityAvailable: 3,
    })

    // --- payment (cash on delivery) ----------------------------------------
    const paid = await request(app)
      .post(`/api/v1/payments/orders/${order._id}/checkout-session`)
      .set('Authorization', customer.token)
      .set('Idempotency-Key', 'journey-payment')
      .expect(201)
    expect(paid.body.data.payment).toMatchObject({ provider: 'cash', status: 'paid' })

    // Paying commits the hold: the goods are now gone from the shelf.
    await expect(Inventory.findById(catalogue.inventory._id).lean()).resolves.toMatchObject({
      quantityOnHand: 3,
      quantityReserved: 0,
      quantityAvailable: 3,
    })
    await expect(InventoryReservation.countDocuments({ status: 'active' })).resolves.toBe(0)

    // Notifications are emitted after the commit, so a paid order always has one.
    const notified = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', customer.token)
      .expect(200)
    expect(notified.body.data.unreadCount).toBeGreaterThan(0)

    // --- fulfilment ---------------------------------------------------------
    const sellerOrderId = await sellerOrderIdFor(catalogue.owner)
    for (const status of ['processing', 'shipped', 'out_for_delivery', 'delivered']) {
      await request(app)
        .patch(`/api/v1/orders/seller/${sellerOrderId}/status`)
        .set('Authorization', authHeader(catalogue.owner))
        .send({ status })
        .expect(200)
    }

    // --- what the customer's tracker shows ---------------------------------
    const tracked = await request(app)
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', customer.token)
      .expect(200)

    expect(tracked.body.data.order.status).toBe('delivered')
    // The timeline opens at `pending` — the moment the order was placed, before
    // payment settled it — and then carries one entry per real fulfilment step.
    expect(tracked.body.data.order.statusHistory.map((entry) => entry.status)).toEqual([
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
    ])
  })

  it('refuses a fulfilment hop that skips a step', async () => {
    const { catalogue } = await placePaidOrder()
    const sellerOrderId = await sellerOrderIdFor(catalogue.owner)

    // confirmed -> shipped is not a legal edge; processing comes first.
    await request(app)
      .patch(`/api/v1/orders/seller/${sellerOrderId}/status`)
      .set('Authorization', authHeader(catalogue.owner))
      .send({ status: 'shipped' })
      .expect(409)

    const listed = await request(app)
      .get('/api/v1/orders/seller/list')
      .set('Authorization', authHeader(catalogue.owner))
      .expect(200)
    expect(listed.body.data.items[0].status).toBe('confirmed')
  })

  it('replays a duplicate checkout without duplicating the order', async () => {
    const catalogue = await createCatalogItem({ quantityOnHand: 5, priceMinor: 1000 })
    const customer = await registerCustomer()
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', customer.token)
      .send({
        productId: catalogue.product._id.toString(),
        variantId: catalogue.variant._id.toString(),
        quantity: 1,
      })
      .expect(201)

    const send = () =>
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', customer.token)
        .set('Idempotency-Key', 'replayed-key')
        .send({ shippingAddress: deliveryPoint })

    const first = await send().expect(201)
    // A retry is answered 200, not 201: nothing new was created.
    const second = await send().expect(200)

    expect(second.body.data.idempotentReplay).toBe(true)
    expect(second.body.data.order._id).toBe(first.body.data.order._id)
    await expect(Order.countDocuments()).resolves.toBe(1)
    await expect(OrderItem.countDocuments()).resolves.toBe(1)
    // The decisive one: a double-submit must not hold the stock twice.
    await expect(Inventory.findById(catalogue.inventory._id).lean()).resolves.toMatchObject({
      quantityReserved: 1,
      quantityAvailable: 4,
    })
  })
})

describe('refunds across the lifecycle', () => {
  it('moves a paid order through partially_refunded to refunded, and blocks over-refunding', async () => {
    const { orderId, order } = await placePaidOrder()
    const admin = await createUser({ role: 'admin' })
    const half = Math.floor(order.totalMinor / 2)

    await request(app)
      .post(`/api/v1/refunds/orders/${orderId}`)
      .set('Authorization', authHeader(admin))
      .set('Idempotency-Key', 'refund-part-one')
      .send({ amountMinor: half, reason: 'Damaged on arrival' })
      .expect(201)

    // The fifth paymentStatus. Code that filters on 'paid' alone loses this
    // order, which has caused real bugs in this codebase.
    await expect(Order.findById(orderId).lean()).resolves.toMatchObject({
      paymentStatus: 'partially_refunded',
    })

    // Asking for the full total again would refund more than was ever charged.
    const excessive = await request(app)
      .post(`/api/v1/refunds/orders/${orderId}`)
      .set('Authorization', authHeader(admin))
      .set('Idempotency-Key', 'refund-too-much')
      .send({ amountMinor: order.totalMinor, reason: 'Trying to over-refund' })
    expect(excessive.status).toBe(409)
    expect(excessive.body.error.code).toBe('REFUND_EXCEEDS_REFUNDABLE')

    // Rejected cleanly: the ledger is untouched by the attempt.
    await expect(Order.findById(orderId).lean()).resolves.toMatchObject({
      refundedMinor: half,
      paymentStatus: 'partially_refunded',
    })

    await request(app)
      .post(`/api/v1/refunds/orders/${orderId}`)
      .set('Authorization', authHeader(admin))
      .set('Idempotency-Key', 'refund-part-two')
      .send({ amountMinor: order.totalMinor - half, reason: 'Remainder' })
      .expect(201)

    await expect(Order.findById(orderId).lean()).resolves.toMatchObject({
      refundedMinor: order.totalMinor,
      paymentStatus: 'refunded',
    })
    await expect(Payment.findOne({ orderId }).lean()).resolves.toMatchObject({
      status: 'refunded',
      refundedMinor: order.totalMinor,
    })
  })
})

describe('the same journey attempted from the wrong account', () => {
  it('hides the order from another customer and refuses their refund', async () => {
    const { orderId } = await placePaidOrder()
    const intruder = await registerCustomer()

    // 404 rather than 403: the existence of someone else's order is not public.
    await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', intruder.token)
      .expect(404)

    // A customer has no refund authority at all.
    await request(app)
      .post(`/api/v1/refunds/orders/${orderId}`)
      .set('Authorization', intruder.token)
      .set('Idempotency-Key', 'intruder-refund')
      .send({ amountMinor: 100, reason: 'Not mine to refund' })
      .expect(403)

    await expect(Order.findById(orderId).lean()).resolves.toMatchObject({
      paymentStatus: 'paid',
      refundedMinor: 0,
    })
  })

  it('refuses to let another seller advance an order that is not theirs', async () => {
    const { catalogue } = await placePaidOrder()
    const sellerOrderId = await sellerOrderIdFor(catalogue.owner)
    const outsider = await createApprovedSeller()

    const response = await request(app)
      .patch(`/api/v1/orders/seller/${sellerOrderId}/status`)
      .set('Authorization', authHeader(outsider.owner))
      .send({ status: 'processing' })
    expect(response.status).toBe(404)

    // The assertion that matters is the state, not the status code: the real
    // seller's order must be exactly where they left it.
    const listed = await request(app)
      .get('/api/v1/orders/seller/list')
      .set('Authorization', authHeader(catalogue.owner))
      .expect(200)
    expect(listed.body.data.items[0].status).toBe('confirmed')
  })
})
