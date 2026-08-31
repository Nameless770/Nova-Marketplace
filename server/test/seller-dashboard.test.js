import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { Review } from '../models/Review.js'
import { address, authHeader, createCatalogItem, createUser } from './factories.js'

async function placePaidOrder({ seller, product, variant, customer, quantity = 2, paid = true }) {
  const unitPriceMinor = variant.currentPriceMinor
  const lineTotalMinor = unitPriceMinor * quantity
  const order = await Order.create({
    orderNumber: `ORD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    customerId: customer._id,
    sellerIds: [seller._id],
    status: paid ? 'confirmed' : 'pending',
    paymentStatus: paid ? 'paid' : 'pending',
    currency: 'USD',
    subtotalMinor: lineTotalMinor,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: lineTotalMinor,
    shippingAddressSnapshot: address,
    billingAddressSnapshot: address,
  })
  const sellerOrder = await SellerOrder.create({
    orderId: order._id,
    sellerId: seller._id,
    sellerOrderNumber: `${order.orderNumber}-S1`,
    subtotalMinor: lineTotalMinor,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: lineTotalMinor,
    itemCount: 1,
  })
  await OrderItem.create({
    orderId: order._id,
    sellerOrderId: sellerOrder._id,
    sellerId: seller._id,
    productId: product._id,
    variantId: variant._id,
    productSnapshot: { title: product.title },
    variantSnapshot: { name: variant.name, sku: variant.sku },
    unitPriceMinor,
    quantity,
    discountMinor: 0,
    taxMinor: 0,
    shippingMinor: 0,
    lineTotalMinor,
  })
  return { order, sellerOrder, lineTotalMinor }
}

describe('seller dashboard authorization', () => {
  it('rejects seller dashboard endpoints without authentication', async () => {
    for (const path of ['/dashboard', '/analytics', '/products', '/orders', '/reviews']) {
      const response = await request(app).get(`/api/v1/sellers${path}`)
      expect(response.status).toBe(401)
    }
  })

  it('rejects seller dashboard endpoints for a customer', async () => {
    const customer = await createUser({ role: 'customer' })
    for (const path of ['/dashboard', '/analytics', '/products', '/orders', '/reviews']) {
      const response = await request(app)
        .get(`/api/v1/sellers${path}`)
        .set('Authorization', authHeader(customer))
      expect(response.status).toBe(403)
    }
  })

  it("never returns another seller's products, orders, reviews, or revenue", async () => {
    const mine = await createCatalogItem({ title: 'My Product' })
    const theirs = await createCatalogItem({ title: 'Their Product' })
    const customer = await createUser({ role: 'customer' })

    await placePaidOrder({
      seller: mine.seller,
      product: mine.product,
      variant: mine.variant,
      customer,
    })
    const other = await placePaidOrder({
      seller: theirs.seller,
      product: theirs.product,
      variant: theirs.variant,
      customer,
      quantity: 7,
    })

    await Review.create({
      productId: theirs.product._id,
      sellerId: theirs.seller._id,
      customerId: customer._id,
      orderId: other.order._id,
      orderItemId: other.sellerOrder._id,
      rating: 1,
      text: 'Competitor review that must never leak',
      status: 'published',
    })

    const headers = { Authorization: authHeader(mine.owner) }
    const [products, orders, reviews, analytics] = await Promise.all([
      request(app).get('/api/v1/sellers/products').set(headers),
      request(app).get('/api/v1/sellers/orders').set(headers),
      request(app).get('/api/v1/sellers/reviews').set(headers),
      request(app).get('/api/v1/sellers/analytics').set(headers),
    ])

    expect(products.body.data.items).toHaveLength(1)
    expect(products.body.data.items[0].title).toBe('My Product')

    expect(orders.body.data.items).toHaveLength(1)
    expect(orders.body.data.items[0].sellerId).toBe(mine.seller._id.toString())

    expect(reviews.body.data.items).toHaveLength(0)

    // Only this seller's 2 units / their own revenue may appear.
    expect(analytics.body.data.metrics.unitsSold).toBe(2)
    expect(analytics.body.data.metrics.orders).toBe(1)
    expect(analytics.body.data.metrics.revenueMinor).toBe(mine.variant.currentPriceMinor * 2)
    expect(analytics.body.data.bestSellers).toHaveLength(1)
    expect(analytics.body.data.bestSellers[0].title).toBe('My Product')
  })

  it('ignores a client-supplied sellerId and uses the authenticated seller', async () => {
    const mine = await createCatalogItem({ title: 'My Product' })
    const theirs = await createCatalogItem({ title: 'Their Product' })

    const response = await request(app)
      .get(`/api/v1/sellers/products?sellerId=${theirs.seller._id}`)
      .set('Authorization', authHeader(mine.owner))

    expect(response.status).toBe(200)
    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0].title).toBe('My Product')
  })
})

describe('seller analytics correctness', () => {
  it('counts only orders Stripe confirmed as paid', async () => {
    const mine = await createCatalogItem()
    const customer = await createUser({ role: 'customer' })

    await placePaidOrder({
      seller: mine.seller,
      product: mine.product,
      variant: mine.variant,
      customer,
      quantity: 3,
      paid: true,
    })
    await placePaidOrder({
      seller: mine.seller,
      product: mine.product,
      variant: mine.variant,
      customer,
      quantity: 9,
      paid: false,
    })

    const response = await request(app)
      .get('/api/v1/sellers/analytics')
      .set('Authorization', authHeader(mine.owner))

    expect(response.status).toBe(200)
    expect(response.body.data.metrics.unitsSold).toBe(3)
    expect(response.body.data.metrics.orders).toBe(1)
    expect(response.body.data.metrics.revenueMinor).toBe(mine.variant.currentPriceMinor * 3)
  })

  it('reports low-stock inventory for the authenticated seller only', async () => {
    const mine = await createCatalogItem({ quantityOnHand: 1 })
    await createCatalogItem({ quantityOnHand: 0 })

    const response = await request(app)
      .get('/api/v1/sellers/analytics')
      .set('Authorization', authHeader(mine.owner))

    expect(response.status).toBe(200)
    expect(response.body.data.lowStock).toHaveLength(1)
    expect(response.body.data.lowStock[0].sku).toBe(mine.variant.sku)
  })

  it('rejects an unbounded analytics date range', async () => {
    const mine = await createCatalogItem()
    const response = await request(app)
      .get('/api/v1/sellers/analytics?from=1970-01-01&to=2099-01-01')
      .set('Authorization', authHeader(mine.owner))

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('DATE_RANGE_TOO_LARGE')
  })
})
