import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { AuditLog } from '../models/AuditLog.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Payment } from '../models/Payment.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { address, authHeader, createCatalogItem, createUser } from './factories.js'

async function paidOrderFor(customer, item, totalMinor = 10000) {
  const order = await Order.create({
    orderNumber: `ORD-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    customerId: customer._id,
    sellerIds: [item.seller._id],
    status: 'delivered',
    paymentStatus: 'paid',
    currency: 'USD',
    subtotalMinor: totalMinor,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor,
    shippingAddressSnapshot: address,
    billingAddressSnapshot: address,
  })
  const sellerOrder = await SellerOrder.create({
    orderId: order._id,
    sellerId: item.seller._id,
    sellerOrderNumber: `${order.orderNumber}-S`,
    subtotalMinor: totalMinor,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor,
    itemCount: 1,
  })
  await OrderItem.create({
    orderId: order._id,
    sellerOrderId: sellerOrder._id,
    sellerId: item.seller._id,
    productId: item.product._id,
    variantId: item.variant._id,
    productSnapshot: { title: item.product.title },
    variantSnapshot: { name: item.variant.name, sku: item.variant.sku },
    unitPriceMinor: totalMinor,
    quantity: 1,
    discountMinor: 0,
    taxMinor: 0,
    shippingMinor: 0,
    lineTotalMinor: totalMinor,
  })
  await Payment.create({
    orderId: order._id,
    customerId: customer._id,
    stripeSessionId: `cs_${order.orderNumber}`,
    stripePaymentIntentId: `pi_${order.orderNumber}`,
    amountMinor: totalMinor,
    currency: 'USD',
    status: 'paid',
    paidAt: new Date(),
    idempotencyKey: `pay-${order.orderNumber}`,
  })
  return order
}

describe('privileged actions are recorded', () => {
  it('records who suspended a user, and what changed', async () => {
    const admin = await createUser({ role: 'admin' })
    const victim = await createUser({ role: 'customer' })

    await request(app)
      .patch(`/api/v1/admin/users/${victim._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended' })
      .expect(200)

    const entry = await AuditLog.findOne({ action: 'user.status_changed' })
    expect(entry.actorId.toString()).toBe(admin._id.toString())
    expect(entry.actorRole).toBe('admin')
    expect(entry.targetId.toString()).toBe(victim._id.toString())
    expect(entry.before.status).toBe('active')
    expect(entry.after.status).toBe('suspended')
    expect(entry.createdAt).toBeInstanceOf(Date)
  })

  it('records a seller moderation decision with its reason', async () => {
    const admin = await createUser({ role: 'admin' })
    const { seller } = await createCatalogItem()

    await request(app)
      .patch(`/api/v1/admin/sellers/${seller._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended', reason: 'Policy violation' })
      .expect(200)

    const entry = await AuditLog.findOne({ action: 'seller.moderated' })
    expect(entry.targetId.toString()).toBe(seller._id.toString())
    expect(entry.after.status).toBe('suspended')
    expect(entry.reason).toBe('Policy violation')
  })

  it('records a refund, the action most worth reconstructing', async () => {
    const admin = await createUser({ role: 'admin' })
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    const order = await paidOrderFor(customer, item)

    await request(app)
      .post(`/api/v1/refunds/orders/${order._id}`)
      .set('Authorization', authHeader(admin))
      .set('Idempotency-Key', 'audit-refund-1')
      .send({ amountMinor: 2500, reason: 'Damaged in transit' })
      .expect(201)

    const entry = await AuditLog.findOne({ action: 'refund.created' })
    expect(entry.actorId.toString()).toBe(admin._id.toString())
    expect(entry.targetId.toString()).toBe(order._id.toString())
    expect(entry.after.amountMinor).toBe(2500)
    expect(entry.reason).toBe('Damaged in transit')
  })

  it('records product and review moderation', async () => {
    const admin = await createUser({ role: 'admin' })
    const item = await createCatalogItem()

    await request(app)
      .patch(`/api/v1/admin/products/${item.product._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'removed' })
      .expect(200)

    const entry = await AuditLog.findOne({ action: 'product.moderated' })
    expect(entry.actorId.toString()).toBe(admin._id.toString())
    expect(entry.after.status).toBe('removed')
  })

  it('rolls the record back with the action when the transaction fails', async () => {
    const admin = await createUser({ role: 'admin' })

    // A seller id that does not exist aborts the transaction; no half-written
    // audit entry may survive it.
    await request(app)
      .patch('/api/v1/admin/sellers/000000000000000000000000/status')
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended', reason: 'Nonexistent' })
      .expect(404)

    expect(await AuditLog.countDocuments({ action: 'seller.moderated' })).toBe(0)
  })

  it('never stores a password hash or payment credential', async () => {
    const admin = await createUser({ role: 'admin' })
    const victim = await createUser({ role: 'customer' })

    await request(app)
      .patch(`/api/v1/admin/users/${victim._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended' })
      .expect(200)

    const entries = await AuditLog.find({}).lean()
    const serialised = JSON.stringify(entries)
    expect(serialised).not.toContain('passwordHash')
    expect(serialised).not.toContain('$2b$')
  })
})

describe('audit log access', () => {
  it('is readable by an admin and filterable by action', async () => {
    const admin = await createUser({ role: 'admin' })
    const victim = await createUser({ role: 'customer' })

    await request(app)
      .patch(`/api/v1/admin/users/${victim._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended' })
      .expect(200)

    const all = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', authHeader(admin))
    expect(all.status).toBe(200)
    expect(all.body.data.items.length).toBeGreaterThan(0)
    expect(all.body.data.meta.total).toBeGreaterThan(0)

    const filtered = await request(app)
      .get('/api/v1/admin/audit-logs?action=user.status_changed')
      .set('Authorization', authHeader(admin))
    expect(filtered.body.data.items.every((e) => e.action === 'user.status_changed')).toBe(true)
  })

  it('is not readable by customers, sellers, or anonymous callers', async () => {
    expect((await request(app).get('/api/v1/admin/audit-logs')).status).toBe(401)

    const customer = await createUser({ role: 'customer' })
    expect(
      (
        await request(app)
          .get('/api/v1/admin/audit-logs')
          .set('Authorization', authHeader(customer))
      ).status,
    ).toBe(403)

    const { owner } = await createCatalogItem()
    expect(
      (await request(app).get('/api/v1/admin/audit-logs').set('Authorization', authHeader(owner)))
        .status,
    ).toBe(403)
  })

  it('exposes no route that edits or deletes an entry', async () => {
    const admin = await createUser({ role: 'admin' })
    const victim = await createUser({ role: 'customer' })
    await request(app)
      .patch(`/api/v1/admin/users/${victim._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended' })
      .expect(200)

    const entry = await AuditLog.findOne({})
    const headers = { Authorization: authHeader(admin) }

    const patched = await request(app)
      .patch(`/api/v1/admin/audit-logs/${entry._id}`)
      .set(headers)
      .send({ action: 'tampered' })
    const deleted = await request(app)
      .delete(`/api/v1/admin/audit-logs/${entry._id}`)
      .set(headers)

    expect(patched.status).toBe(404)
    expect(deleted.status).toBe(404)
    expect((await AuditLog.findById(entry._id)).action).toBe('user.status_changed')
  })
})
