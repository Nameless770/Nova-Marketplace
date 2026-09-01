import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { app } from '../app.js'
import { Inventory } from '../models/Inventory.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Payment } from '../models/Payment.js'
import { Refund } from '../models/Refund.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { applyRefundEvent } from '../services/refundService.js'
import { address, authHeader, createCatalogItem, createUser } from './factories.js'

// Stripe refund creation is the only network call in this flow; the controller
// tolerates its failure by design (the refund stays pending), so these tests
// exercise the recorded-refund + webhook path without hitting the network.
vi.mock('stripe', () => ({
  default: class {
    refunds = {
      create: vi.fn(async ({ amount }) => ({
        id: `re_test_${amount}_${Math.random().toString(36).slice(2, 8)}`,
        status: 'succeeded',
      })),
    }
    webhooks = { constructEvent: vi.fn() }
  },
}))

async function buildPaidOrder({ priceMinor = 5000, quantity = 2, quantityOnHand = 10 } = {}) {
  const customer = await createUser({ role: 'customer' })
  const item = await createCatalogItem({ priceMinor, quantityOnHand })
  const total = priceMinor * quantity

  const order = await Order.create({
    orderNumber: `ORD-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    customerId: customer._id,
    sellerIds: [item.seller._id],
    status: 'delivered',
    paymentStatus: 'paid',
    currency: 'USD',
    subtotalMinor: total,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: total,
    shippingAddressSnapshot: address,
    billingAddressSnapshot: address,
  })
  const sellerOrder = await SellerOrder.create({
    orderId: order._id,
    sellerId: item.seller._id,
    sellerOrderNumber: `${order.orderNumber}-S`,
    status: 'delivered',
    subtotalMinor: total,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: total,
    itemCount: 1,
  })
  const orderItem = await OrderItem.create({
    orderId: order._id,
    sellerOrderId: sellerOrder._id,
    sellerId: item.seller._id,
    productId: item.product._id,
    variantId: item.variant._id,
    productSnapshot: { title: item.product.title },
    variantSnapshot: { name: item.variant.name, sku: item.variant.sku },
    unitPriceMinor: priceMinor,
    quantity,
    discountMinor: 0,
    taxMinor: 0,
    shippingMinor: 0,
    lineTotalMinor: total,
  })
  const payment = await Payment.create({
    orderId: order._id,
    customerId: customer._id,
    // A card payment: these tests exercise the processor path, where a refund
    // stays pending until its webhook settles it.
    provider: 'stripe',
    providerSessionId: `cs_${order.orderNumber}`,
    providerPaymentIntentId: `pi_${order.orderNumber}`,
    amountMinor: total,
    currency: 'USD',
    status: 'paid',
    paidAt: new Date(),
    idempotencyKey: `pay-${order.orderNumber}`,
  })

  return { customer, item, order, sellerOrder, orderItem, payment, total }
}

function refundRequest(actor, orderId, body, key) {
  return request(app)
    .post(`/api/v1/refunds/orders/${orderId}`)
    .set('Authorization', authHeader(actor))
    .set('Idempotency-Key', key)
    .send(body)
}

describe('refund authorization', () => {
  it('rejects refunds from customers and anonymous callers', async () => {
    const { order, customer } = await buildPaidOrder()

    const anonymous = await request(app)
      .post(`/api/v1/refunds/orders/${order._id}`)
      .set('Idempotency-Key', 'k1')
      .send({ amountMinor: 100, reason: 'test' })
    expect(anonymous.status).toBe(401)

    const asCustomer = await refundRequest(
      customer,
      order._id,
      {
        amountMinor: 100,
        reason: 'test',
      },
      'k2',
    )
    expect(asCustomer.status).toBe(403)
    expect(await Refund.countDocuments()).toBe(0)
  })

  it("never lets a seller refund another seller's order", async () => {
    const { order } = await buildPaidOrder()
    const outsider = await createCatalogItem()

    const response = await refundRequest(
      outsider.owner,
      order._id,
      { amountMinor: 100, reason: 'not mine' },
      'k3',
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('SELLER_ORDER_NOT_FOUND')
    expect(await Refund.countDocuments()).toBe(0)
  })

  it('caps a seller at their own SellerOrder total on a multi-vendor order', async () => {
    const { order, item } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })
    // A second seller holds part of the same order.
    const other = await createCatalogItem()
    await SellerOrder.create({
      orderId: order._id,
      sellerId: other.seller._id,
      sellerOrderNumber: `${order.orderNumber}-S2`,
      subtotalMinor: 4000,
      shippingMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 4000,
      itemCount: 1,
    })
    await Order.updateOne(
      { _id: order._id },
      { $set: { totalMinor: 14000 }, $push: { sellerIds: other.seller._id } },
    )
    await Payment.updateOne({ orderId: order._id }, { $set: { amountMinor: 14000 } })

    // Seller one's own SellerOrder is 10000; asking for 11000 must fail even
    // though the payment itself has 14000 available.
    const response = await refundRequest(
      item.owner,
      order._id,
      { amountMinor: 11000, reason: 'over own scope' },
      'k4',
    )

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('REFUND_EXCEEDS_REFUNDABLE')
  })
})

describe('refund amount invariants', () => {
  it('refuses to refund more than was captured', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order, total } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })

    const response = await refundRequest(
      admin,
      order._id,
      { amountMinor: total + 1, reason: 'too much' },
      'k5',
    )

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('REFUND_EXCEEDS_REFUNDABLE')
    expect((await Payment.findOne({ orderId: order._id })).refundedMinor).toBe(0)
  })

  it('supports partial refunds and moves the payment to partially_refunded', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })

    const response = await refundRequest(
      admin,
      order._id,
      { amountMinor: 3000, reason: 'damaged item' },
      'k6',
    )

    expect(response.status).toBe(201)
    expect(response.body.data.refund.amountMinor).toBe(3000)

    const payment = await Payment.findOne({ orderId: order._id })
    expect(payment.refundedMinor).toBe(3000)
    expect(payment.status).toBe('partially_refunded')

    const updated = await Order.findById(order._id)
    expect(updated.paymentStatus).toBe('partially_refunded')
    expect(updated.status).not.toBe('refunded')
  })

  it('marks the payment and order fully refunded once the total is reached', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })

    await refundRequest(admin, order._id, { amountMinor: 6000, reason: 'part one' }, 'k7')
    const second = await refundRequest(
      admin,
      order._id,
      { amountMinor: 4000, reason: 'part two' },
      'k8',
    )
    expect(second.status).toBe(201)

    const payment = await Payment.findOne({ orderId: order._id })
    expect(payment.refundedMinor).toBe(10000)
    expect(payment.status).toBe('refunded')

    const updated = await Order.findById(order._id)
    expect(updated.paymentStatus).toBe('refunded')
    expect(updated.status).toBe('refunded')

    // A third refund of even 1 minor unit must now fail.
    const third = await refundRequest(admin, order._id, { amountMinor: 1, reason: 'extra' }, 'k9')
    expect(third.status).toBe(409)
  })

  it('does not let concurrent refunds exceed the captured amount', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })

    // Two racing refunds of 6000 against a 10000 payment: exactly one may win.
    const results = await Promise.allSettled([
      refundRequest(admin, order._id, { amountMinor: 6000, reason: 'race a' }, 'race-a'),
      refundRequest(admin, order._id, { amountMinor: 6000, reason: 'race b' }, 'race-b'),
    ])

    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 500))
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)

    const payment = await Payment.findOne({ orderId: order._id })
    expect(payment.refundedMinor).toBeLessThanOrEqual(payment.amountMinor)
    expect(payment.refundedMinor).toBe(6000)
  })
})

describe('refund idempotency', () => {
  it('replays a duplicate Idempotency-Key without refunding twice', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })

    const first = await refundRequest(admin, order._id, { amountMinor: 2500, reason: 'dup' }, 'dup')
    const second = await refundRequest(
      admin,
      order._id,
      { amountMinor: 2500, reason: 'dup' },
      'dup',
    )

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.data.idempotentReplay).toBe(true)
    expect(second.body.data.refund.refundNumber).toBe(first.body.data.refund.refundNumber)

    expect(await Refund.countDocuments({ orderId: order._id })).toBe(1)
    expect((await Payment.findOne({ orderId: order._id })).refundedMinor).toBe(2500)
  })

  it('requires an Idempotency-Key', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order } = await buildPaidOrder()

    const response = await request(app)
      .post(`/api/v1/refunds/orders/${order._id}`)
      .set('Authorization', authHeader(admin))
      .send({ amountMinor: 100, reason: 'no key' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })
})

describe('refund settlement', () => {
  it('restocks refunded units only when restock was requested', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order, orderItem, item } = await buildPaidOrder({ quantityOnHand: 10, quantity: 2 })

    const response = await refundRequest(
      admin,
      order._id,
      {
        amountMinor: 5000,
        reason: 'returned',
        restock: true,
        items: [{ orderItemId: orderItem._id.toString(), quantity: 1 }],
      },
      'restock-1',
    )
    expect(response.status).toBe(201)

    const before = await Inventory.findById(item.inventory._id)
    expect(before.quantityOnHand).toBe(10)

    await applyRefundEvent(response.body.data.refund.providerRefundId, 'succeeded')

    const after = await Inventory.findById(item.inventory._id)
    expect(after.quantityOnHand).toBe(11)
    expect(after.quantityAvailable).toBe(11)
  })

  // Cash on delivery has no processor to wait on: the money is handed back at
  // the door, so recording the refund *is* the settlement.
  it('settles a cash refund immediately instead of waiting for a webhook', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order, payment } = await buildPaidOrder()
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { provider: 'cash' }, $unset: { providerPaymentIntentId: '' } },
    )

    const response = await refundRequest(
      admin,
      order._id,
      { amountMinor: 4000, reason: 'damaged on arrival' },
      'cash-refund-1',
    )

    expect(response.status).toBe(201)
    // No provider error, and terminal without any webhook being delivered.
    expect(response.body.data.providerError).toBeNull()
    expect(response.body.data.refund.status).toBe('succeeded')

    const settled = await Payment.findById(payment._id)
    expect(settled.refundedMinor).toBe(4000)
  })

  it('is idempotent when the same refund event arrives twice', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order, orderItem, item } = await buildPaidOrder({ quantityOnHand: 10, quantity: 2 })

    const response = await refundRequest(
      admin,
      order._id,
      {
        amountMinor: 5000,
        reason: 'returned',
        restock: true,
        items: [{ orderItemId: orderItem._id.toString(), quantity: 1 }],
      },
      'restock-2',
    )

    const refundId = response.body.data.refund.providerRefundId
    await applyRefundEvent(refundId, 'succeeded')
    await applyRefundEvent(refundId, 'succeeded')

    const after = await Inventory.findById(item.inventory._id)
    expect(after.quantityOnHand).toBe(11) // restocked once, not twice
    expect(await Refund.countDocuments({ status: 'succeeded' })).toBe(1)
  })

  it('releases the reserved amount when the provider reports failure', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })

    const response = await refundRequest(
      admin,
      order._id,
      { amountMinor: 4000, reason: 'will fail' },
      'fail-1',
    )
    expect((await Payment.findOne({ orderId: order._id })).refundedMinor).toBe(4000)

    await applyRefundEvent(response.body.data.refund.providerRefundId, 'failed')

    const payment = await Payment.findOne({ orderId: order._id })
    expect(payment.refundedMinor).toBe(0)
    expect(payment.status).toBe('paid')

    const updated = await Order.findById(order._id)
    expect(updated.paymentStatus).toBe('paid')
  })
})

describe('refund reporting', () => {
  it('reports the refundable balance for the caller scope', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })

    await refundRequest(admin, order._id, { amountMinor: 2000, reason: 'partial' }, 'bal-1')

    const response = await request(app)
      .get(`/api/v1/refunds/orders/${order._id}/refundable`)
      .set('Authorization', authHeader(admin))

    expect(response.status).toBe(200)
    expect(response.body.data.ceilingMinor).toBe(10000)
    expect(response.body.data.refundedMinor).toBe(2000)
    expect(response.body.data.refundableMinor).toBe(8000)
  })

  it('splits an admin refund across sellers so the parts sum to the whole', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order, item } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })
    const other = await createCatalogItem()
    await SellerOrder.create({
      orderId: order._id,
      sellerId: other.seller._id,
      sellerOrderNumber: `${order.orderNumber}-S2`,
      subtotalMinor: 5000,
      shippingMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 5000,
      itemCount: 1,
    })
    await Order.updateOne({ _id: order._id }, { $set: { totalMinor: 15000 } })
    await Payment.updateOne({ orderId: order._id }, { $set: { amountMinor: 15000 } })

    // 999 splits 10000:5000 — deliberately not divisible, to catch rounding loss.
    const response = await refundRequest(
      admin,
      order._id,
      { amountMinor: 999, reason: 'split' },
      'split-1',
    )
    expect(response.status).toBe(201)

    const refund = await Refund.findOne({ orderId: order._id })
    const sum = refund.allocations.reduce((total, a) => total + a.amountMinor, 0)
    expect(sum).toBe(999)
    expect(refund.allocations).toHaveLength(2)

    const mine = refund.allocations.find(
      (a) => a.sellerId.toString() === item.seller._id.toString(),
    )
    expect(mine.amountMinor).toBe(666)
  })

  it('subtracts succeeded refunds from seller analytics revenue', async () => {
    const admin = await createUser({ role: 'admin' })
    const { order, item } = await buildPaidOrder({ priceMinor: 5000, quantity: 2 })

    const before = await request(app)
      .get('/api/v1/sellers/analytics')
      .set('Authorization', authHeader(item.owner))
    expect(before.body.data.metrics.revenueMinor).toBe(10000)

    const response = await refundRequest(
      admin,
      order._id,
      { amountMinor: 3000, reason: 'goodwill' },
      'analytics-1',
    )
    await applyRefundEvent(response.body.data.refund.providerRefundId, 'succeeded')

    const after = await request(app)
      .get('/api/v1/sellers/analytics')
      .set('Authorization', authHeader(item.owner))

    // The partially refunded order still counts as a sale; only the refunded
    // portion is deducted.
    expect(after.body.data.metrics.grossRevenueMinor).toBe(10000)
    expect(after.body.data.metrics.refundedMinor).toBe(3000)
    expect(after.body.data.metrics.revenueMinor).toBe(7000)
  })
})
