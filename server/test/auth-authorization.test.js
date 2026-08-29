import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { Order } from '../models/Order.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { address, authHeader, createApprovedSeller, createUser } from './factories.js'

describe('authentication', () => {
  it('registers a customer', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'register@example.com',
      password: 'Password123!',
      firstName: 'Rina',
      lastName: 'Customer',
    })

    expect(response.status).toBe(201)
    expect(response.body.data.user.email).toBe('register@example.com')
    expect(response.body.data.accessToken).toEqual(expect.any(String))
  })

  it('logs in with valid credentials', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'login@example.com',
      password: 'Password123!',
      firstName: 'Lina',
      lastName: 'Customer',
    })

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'login@example.com',
      password: 'Password123!',
    })

    expect(response.status).toBe(200)
    expect(response.body.data.accessToken).toEqual(expect.any(String))
  })

  it('rejects invalid credentials', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'missing@example.com',
      password: 'WrongPassword123!',
    })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects protected routes without a token', async () => {
    const response = await request(app).get('/api/v1/cart')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })
})

describe('authorization', () => {
  it("prevents a customer from reading another customer's order", async () => {
    const owner = await createUser()
    const otherCustomer = await createUser()
    const order = await Order.create({
      orderNumber: 'ORD-OWNER',
      customerId: owner._id,
      sellerIds: [],
      currency: 'USD',
      subtotalMinor: 1000,
      shippingMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 1000,
      shippingAddressSnapshot: address,
      billingAddressSnapshot: address,
    })

    const response = await request(app)
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', authHeader(otherCustomer))

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('ORDER_NOT_FOUND')
  })

  it("prevents a seller from reading another seller's SellerOrder", async () => {
    const sellerA = await createApprovedSeller({ storeName: 'Seller A', slug: 'seller-a' })
    const sellerB = await createApprovedSeller({ storeName: 'Seller B', slug: 'seller-b' })
    const customer = await createUser()
    const order = await Order.create({
      orderNumber: 'ORD-SELLER-A',
      customerId: customer._id,
      sellerIds: [sellerA.seller._id],
      currency: 'USD',
      subtotalMinor: 1000,
      shippingMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 1000,
      shippingAddressSnapshot: address,
      billingAddressSnapshot: address,
    })
    const sellerOrder = await SellerOrder.create({
      orderId: order._id,
      sellerId: sellerA.seller._id,
      sellerOrderNumber: 'SO-SELLER-A',
      subtotalMinor: 1000,
      shippingMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 1000,
      itemCount: 1,
    })

    const response = await request(app)
      .get(`/api/v1/orders/seller/${sellerOrder._id}`)
      .set('Authorization', authHeader(sellerB.owner))

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('SELLER_ORDER_NOT_FOUND')
  })

  it('rejects admin-only operations for non-admin users', async () => {
    const customer = await createUser()

    const response = await request(app)
      .get('/api/v1/admin/sellers')
      .set('Authorization', authHeader(customer))

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })
})
