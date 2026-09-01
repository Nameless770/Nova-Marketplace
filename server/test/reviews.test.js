import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Review } from '../models/Review.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { address, authHeader, createCatalogItem, createUser } from './factories.js'

/**
 * Reviews are a trust surface: a review that did not come from a real purchase
 * is fraud, and a seller editing a customer's words is worse. These tests cover
 * the eligibility rules rather than the CRUD.
 */
async function buyItem(customer, item, { paymentStatus = 'paid', quantity = 1 } = {}) {
  const total = item.variant.currentPriceMinor * quantity
  const order = await Order.create({
    orderNumber: `ORD-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    customerId: customer._id,
    sellerIds: [item.seller._id],
    status: 'delivered',
    paymentStatus,
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
    subtotalMinor: total,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: total,
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
    unitPriceMinor: item.variant.currentPriceMinor,
    quantity,
    discountMinor: 0,
    taxMinor: 0,
    shippingMinor: 0,
    lineTotalMinor: total,
  })
  return order
}

function postReview(actor, productId, body) {
  return request(app)
    .post(`/api/v1/reviews/products/${productId}`)
    .set('Authorization', authHeader(actor))
    .send({ rating: 5, text: 'Genuinely good.', ...body })
}

describe('review eligibility', () => {
  it('refuses a review from someone who never bought the product', async () => {
    const stranger = await createUser({ role: 'customer' })
    const item = await createCatalogItem()

    const response = await postReview(stranger, item.product._id)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('PURCHASE_REQUIRED')
    expect(await Review.countDocuments()).toBe(0)
  })

  it('refuses a review when the order was never paid', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item, { paymentStatus: 'pending' })

    const response = await postReview(customer, item.product._id)

    expect(response.status).toBe(403)
    expect(await Review.countDocuments()).toBe(0)
  })

  it('allows a review from a verified purchaser', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item)

    const response = await postReview(customer, item.product._id)

    expect(response.status).toBe(201)
    const review = await Review.findOne({ customerId: customer._id })
    expect(review.verifiedPurchase).toBe(true)
    // New reviews are moderated, not published on arrival.
    expect(review.status).toBe('pending')
  })

  it('still allows a review after a partial refund on the order', async () => {
    // A partially refunded order is still a completed purchase. Excluding it
    // would silently strip review rights from anyone who got money back.
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item, { paymentStatus: 'partially_refunded' })

    const response = await postReview(customer, item.product._id)

    expect(response.status).toBe(201)
  })

  it('refuses a second review of the same product by the same customer', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item)

    await postReview(customer, item.product._id).expect(201)
    const second = await postReview(customer, item.product._id, { text: 'Changed my mind.' })

    expect(second.status).toBe(409)
    expect(await Review.countDocuments({ productId: item.product._id })).toBe(1)
  })

  it('refuses a review of a product the customer did not buy in that order', async () => {
    const customer = await createUser({ role: 'customer' })
    const bought = await createCatalogItem({ slug: 'bought' })
    const notBought = await createCatalogItem({ slug: 'not-bought' })
    await buyItem(customer, bought)

    const response = await postReview(customer, notBought.product._id)
    expect(response.status).toBe(403)
  })
})

describe('review input validation', () => {
  it('rejects ratings outside 1 to 5', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item)

    for (const rating of [0, 6, 4.5, -1]) {
      const response = await postReview(customer, item.product._id, { rating })
      expect(response.status, `rating ${rating}`).toBe(400)
    }
    expect(await Review.countDocuments()).toBe(0)
  })

  it('rejects empty or oversized text', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item)

    expect((await postReview(customer, item.product._id, { text: '   ' })).status).toBe(400)
    expect((await postReview(customer, item.product._id, { text: 'x'.repeat(5001) })).status).toBe(
      400,
    )
  })
})

describe('review visibility and ownership', () => {
  it('hides unmoderated reviews from the public product listing', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item)
    await postReview(customer, item.product._id).expect(201)

    const publicView = await request(app).get(`/api/v1/reviews/products/${item.product._id}`)

    expect(publicView.status).toBe(200)
    expect(publicView.body.data.items).toHaveLength(0)
  })

  it('shows a review once an admin publishes it', async () => {
    const admin = await createUser({ role: 'admin' })
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item)
    const created = await postReview(customer, item.product._id)

    await request(app)
      .patch(`/api/v1/admin/reviews/${created.body.data.review._id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'published' })
      .expect(200)

    const publicView = await request(app).get(`/api/v1/reviews/products/${item.product._id}`)
    expect(publicView.body.data.items).toHaveLength(1)
  })

  it('never lets a seller edit or delete a customer review', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(customer, item)
    const created = await postReview(customer, item.product._id)
    const reviewId = created.body.data.review._id

    const edit = await request(app)
      .patch(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', authHeader(item.owner))
      .send({ rating: 5, text: 'The seller rewrote this.' })
    expect(edit.status).toBe(403)

    const remove = await request(app)
      .delete(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', authHeader(item.owner))
    expect(remove.status).toBe(403)

    const untouched = await Review.findById(reviewId)
    expect(untouched.text).toBe('Genuinely good.')
  })

  it("never lets one customer edit another customer's review", async () => {
    const author = await createUser({ role: 'customer' })
    const other = await createUser({ role: 'customer' })
    const item = await createCatalogItem()
    await buyItem(author, item)
    const created = await postReview(author, item.product._id)

    const response = await request(app)
      .patch(`/api/v1/reviews/${created.body.data.review._id}`)
      .set('Authorization', authHeader(other))
      .send({ rating: 1, text: 'Sabotage.' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect((await Review.findById(created.body.data.review._id)).rating).toBe(5)
  })

  it('requires authentication to write a review', async () => {
    const item = await createCatalogItem()
    const response = await request(app)
      .post(`/api/v1/reviews/products/${item.product._id}`)
      .send({ rating: 5, text: 'Anonymous.' })
    expect(response.status).toBe(401)
  })
})
