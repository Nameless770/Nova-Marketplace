import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { Coupon } from '../models/Coupon.js'
import { Order } from '../models/Order.js'
import { User } from '../models/User.js'
import { address, authHeader, createCatalogItem, createUser } from './factories.js'

const ADMIN_PATHS = [
  '/overview',
  '/users',
  '/orders',
  '/inventory',
  '/categories',
  '/coupons',
  '/sellers',
  '/products',
  '/reviews',
]

async function paidOrder(customer, sellerId, totalMinor) {
  return Order.create({
    orderNumber: `ORD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    customerId: customer._id,
    sellerIds: [sellerId],
    status: 'confirmed',
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
}

describe('admin dashboard authorization', () => {
  it('rejects every admin endpoint without authentication', async () => {
    for (const path of ADMIN_PATHS) {
      const response = await request(app).get(`/api/v1/admin${path}`)
      expect(response.status, path).toBe(401)
    }
  })

  it('rejects every admin endpoint for a customer', async () => {
    const customer = await createUser({ role: 'customer' })
    for (const path of ADMIN_PATHS) {
      const response = await request(app)
        .get(`/api/v1/admin${path}`)
        .set('Authorization', authHeader(customer))
      expect(response.status, path).toBe(403)
    }
  })

  it('rejects every admin endpoint for an approved seller', async () => {
    const { owner } = await createCatalogItem()
    for (const path of ADMIN_PATHS) {
      const response = await request(app)
        .get(`/api/v1/admin${path}`)
        .set('Authorization', authHeader(owner))
      expect(response.status, path).toBe(403)
    }
  })

  it('rejects admin mutations for non-admins', async () => {
    const customer = await createUser({ role: 'customer' })
    const victim = await createUser({ role: 'customer' })
    const response = await request(app)
      .patch(`/api/v1/admin/users/${victim._id}/status`)
      .set('Authorization', authHeader(customer))
      .send({ status: 'suspended' })

    expect(response.status).toBe(403)
    expect((await User.findById(victim._id)).status).toBe('active')
  })
})

describe('admin user management guards', () => {
  it('suspends and reactivates a customer', async () => {
    const admin = await createUser({ role: 'admin' })
    const victim = await createUser({ role: 'customer' })

    const suspended = await request(app)
      .patch(`/api/v1/admin/users/${victim._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended' })
    expect(suspended.status).toBe(200)
    expect((await User.findById(victim._id)).status).toBe('suspended')

    const reactivated = await request(app)
      .patch(`/api/v1/admin/users/${victim._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'active' })
    expect(reactivated.status).toBe(200)
    expect((await User.findById(victim._id)).status).toBe('active')
  })

  it('never lets an admin suspend their own account', async () => {
    const admin = await createUser({ role: 'admin' })
    const response = await request(app)
      .patch(`/api/v1/admin/users/${admin._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended' })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('SELF_MODERATION')
    expect((await User.findById(admin._id)).status).toBe('active')
  })

  it('never lets one admin suspend another admin', async () => {
    const admin = await createUser({ role: 'admin' })
    const otherAdmin = await createUser({ role: 'admin' })
    const response = await request(app)
      .patch(`/api/v1/admin/users/${otherAdmin._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended' })

    expect(response.status).toBe(403)
    expect((await User.findById(otherAdmin._id)).status).toBe('active')
  })

  it('never leaks password hashes in the user list', async () => {
    const admin = await createUser({ role: 'admin' })
    await createUser({ role: 'customer' })
    const response = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', authHeader(admin))

    expect(response.status).toBe(200)
    expect(response.body.data.items.length).toBeGreaterThan(0)
    for (const user of response.body.data.items) {
      expect(user.passwordHash).toBeUndefined()
    }
    expect(JSON.stringify(response.body)).not.toContain('passwordHash')
  })
})

describe('admin tables: search, filter, sort, pagination', () => {
  it('filters users by role and paginates with totals', async () => {
    const admin = await createUser({ role: 'admin' })
    for (let index = 0; index < 5; index += 1) await createUser({ role: 'customer' })

    const page1 = await request(app)
      .get('/api/v1/admin/users?role=customer&limit=2&page=1')
      .set('Authorization', authHeader(admin))
    const page2 = await request(app)
      .get('/api/v1/admin/users?role=customer&limit=2&page=2')
      .set('Authorization', authHeader(admin))

    expect(page1.body.data.items).toHaveLength(2)
    expect(page1.body.data.meta.total).toBe(5)
    expect(page1.body.data.meta.totalPages).toBe(3)
    expect(page1.body.data.items.every((user) => user.role === 'customer')).toBe(true)
    // Pages must not overlap.
    const ids = new Set(page1.body.data.items.map((user) => user._id))
    expect(page2.body.data.items.some((user) => ids.has(user._id))).toBe(false)
  })

  it('searches users by email prefix', async () => {
    const admin = await createUser({ role: 'admin' })
    await createUser({ role: 'customer', email: 'findme@example.com' })
    await createUser({ role: 'customer', email: 'other@example.com' })

    const response = await request(app)
      .get('/api/v1/admin/users?q=findme')
      .set('Authorization', authHeader(admin))

    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0].email).toBe('findme@example.com')
  })

  it('treats a regex metacharacter search as a literal, not a pattern', async () => {
    const admin = await createUser({ role: 'admin' })
    await createUser({ role: 'customer', email: 'literal@example.com' })

    const response = await request(app)
      .get('/api/v1/admin/users?q=.*')
      .set('Authorization', authHeader(admin))

    expect(response.status).toBe(200)
    expect(response.body.data.items).toHaveLength(0)
  })

  it('sorts orders by total descending and ascending', async () => {
    const admin = await createUser({ role: 'admin' })
    const customer = await createUser({ role: 'customer' })
    const { seller } = await createCatalogItem()
    await paidOrder(customer, seller._id, 500)
    await paidOrder(customer, seller._id, 9000)

    const desc = await request(app)
      .get('/api/v1/admin/orders?sortBy=totalMinor&sortDir=desc')
      .set('Authorization', authHeader(admin))
    const asc = await request(app)
      .get('/api/v1/admin/orders?sortBy=totalMinor&sortDir=asc')
      .set('Authorization', authHeader(admin))

    expect(desc.body.data.items[0].totalMinor).toBe(9000)
    expect(asc.body.data.items[0].totalMinor).toBe(500)
  })
})

describe('admin platform overview', () => {
  it('reports revenue from paid orders only, across all sellers', async () => {
    const admin = await createUser({ role: 'admin' })
    const customer = await createUser({ role: 'customer' })
    const a = await createCatalogItem()
    const b = await createCatalogItem()

    await paidOrder(customer, a.seller._id, 10000)
    await paidOrder(customer, b.seller._id, 25000)
    await Order.create({
      orderNumber: 'ORD-UNPAID',
      customerId: customer._id,
      sellerIds: [a.seller._id],
      status: 'pending',
      paymentStatus: 'pending',
      currency: 'USD',
      subtotalMinor: 999999,
      shippingMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 999999,
      shippingAddressSnapshot: address,
      billingAddressSnapshot: address,
    })

    const response = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', authHeader(admin))

    expect(response.status).toBe(200)
    expect(response.body.data.revenue.allTimeMinor).toBe(35000)
    expect(response.body.data.revenue.paidOrdersAllTime).toBe(2)
    expect(response.body.data.orders.total).toBe(3)
    expect(response.body.data.series.length).toBeGreaterThan(0)
  })

  it('rejects an unbounded overview date range', async () => {
    const admin = await createUser({ role: 'admin' })
    const response = await request(app)
      .get('/api/v1/admin/overview?from=1970-01-01&to=2099-01-01')
      .set('Authorization', authHeader(admin))

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('DATE_RANGE_TOO_LARGE')
  })
})

describe('admin coupon management', () => {
  it('deactivates and reactivates a coupon', async () => {
    const admin = await createUser({ role: 'admin' })
    const coupon = await Coupon.create({
      code: 'ADMIN10',
      ownerType: 'platform',
      discountType: 'fixed',
      discountValue: 1000,
      currency: 'USD',
      expiresAt: new Date(Date.now() + 86400000),
      status: 'active',
      createdBy: admin._id,
    })

    const off = await request(app)
      .patch(`/api/v1/admin/coupons/${coupon._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'inactive' })
    expect(off.status).toBe(200)
    expect((await Coupon.findById(coupon._id)).status).toBe('inactive')

    const on = await request(app)
      .patch(`/api/v1/admin/coupons/${coupon._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'active' })
    expect(on.status).toBe(200)
    expect((await Coupon.findById(coupon._id)).status).toBe('active')
  })

  it('rejects an invalid coupon status', async () => {
    const admin = await createUser({ role: 'admin' })
    const coupon = await Coupon.create({
      code: 'ADMIN11',
      ownerType: 'platform',
      discountType: 'fixed',
      discountValue: 1000,
      currency: 'USD',
      expiresAt: new Date(Date.now() + 86400000),
      status: 'active',
      createdBy: admin._id,
    })

    const response = await request(app)
      .patch(`/api/v1/admin/coupons/${coupon._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'deleted' })

    expect(response.status).toBe(400)
  })
})
