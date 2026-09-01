import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { Category } from '../models/Category.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Product } from '../models/Product.js'
import { RecentlyViewed } from '../models/RecentlyViewed.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { Wishlist } from '../models/Wishlist.js'
import {
  buildTasteProfile,
  flushViewWrites,
  recommendForUser,
  similarProducts,
} from '../services/recommendationService.js'
import { address, authHeader, createCatalogItem, createUser } from './factories.js'

async function catalogueItem({ title, slug, brand, categoryId, priceMinor = 5000, qty = 5 }) {
  const item = await createCatalogItem({ title, slug, priceMinor, quantityOnHand: qty })
  await Product.updateOne(
    { _id: item.product._id },
    { $set: { brand, ...(categoryId ? { categoryIds: [categoryId] } : {}) } },
  )
  return item
}

async function purchase(customer, item, priceMinor = 5000) {
  const order = await Order.create({
    orderNumber: `ORD-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    customerId: customer._id,
    sellerIds: [item.seller._id],
    status: 'delivered',
    paymentStatus: 'paid',
    currency: 'USD',
    subtotalMinor: priceMinor,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: priceMinor,
    shippingAddressSnapshot: address,
    billingAddressSnapshot: address,
  })
  const sellerOrder = await SellerOrder.create({
    orderId: order._id,
    sellerId: item.seller._id,
    sellerOrderNumber: `${order.orderNumber}-S`,
    subtotalMinor: priceMinor,
    shippingMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: priceMinor,
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
    unitPriceMinor: priceMinor,
    quantity: 1,
    discountMinor: 0,
    taxMinor: 0,
    shippingMinor: 0,
    lineTotalMinor: priceMinor,
  })
}

describe('taste profile', () => {
  it('weights a purchase above a wishlist entry above a view', async () => {
    const customer = await createUser({ role: 'customer' })
    const audio = await Category.create({ name: 'Audio', slug: 'audio' })
    const lighting = await Category.create({ name: 'Lighting', slug: 'lighting' })
    const decor = await Category.create({ name: 'Decor', slug: 'decor' })

    const bought = await catalogueItem({
      title: 'Bought Headphones',
      slug: 'bought-hp',
      brand: 'Nova',
      categoryId: audio._id,
    })
    const wished = await catalogueItem({
      title: 'Wished Lamp',
      slug: 'wished-lamp',
      brand: 'Lumen',
      categoryId: lighting._id,
    })
    const viewedItem = await catalogueItem({
      title: 'Viewed Vase',
      slug: 'viewed-vase',
      brand: 'Clay',
      categoryId: decor._id,
    })

    await purchase(customer, bought)
    await Wishlist.create({
      userId: customer._id,
      items: [{ productId: wished.product._id, sellerId: wished.seller._id, addedAt: new Date() }],
    })
    await RecentlyViewed.create({
      userId: customer._id,
      productId: viewedItem.product._id,
      categoryIds: [decor._id],
      brand: 'Clay',
      priceMinor: 5000,
      lastViewedAt: new Date(),
    })

    const profile = await buildTasteProfile(customer._id)

    const audioWeight = profile.categoryWeights.get(audio._id.toString())
    const lightingWeight = profile.categoryWeights.get(lighting._id.toString())
    const decorWeight = profile.categoryWeights.get(decor._id.toString())

    expect(audioWeight).toBeGreaterThan(lightingWeight)
    expect(lightingWeight).toBeGreaterThan(decorWeight)
    expect(profile.signalCounts).toEqual({ purchases: 1, wishlist: 1, views: 1 })
  })

  it('decays an old view relative to a fresh one', async () => {
    const customer = await createUser({ role: 'customer' })
    const fresh = await Category.create({ name: 'Fresh', slug: 'fresh' })
    const stale = await Category.create({ name: 'Stale', slug: 'stale' })
    const a = await catalogueItem({ title: 'A', slug: 'a', brand: 'X', categoryId: fresh._id })
    const b = await catalogueItem({ title: 'B', slug: 'b', brand: 'Y', categoryId: stale._id })

    await RecentlyViewed.create({
      userId: customer._id,
      productId: a.product._id,
      categoryIds: [fresh._id],
      lastViewedAt: new Date(),
    })
    await RecentlyViewed.create({
      userId: customer._id,
      productId: b.product._id,
      categoryIds: [stale._id],
      lastViewedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    })

    const profile = await buildTasteProfile(customer._id)
    expect(profile.categoryWeights.get(fresh._id.toString())).toBeGreaterThan(
      profile.categoryWeights.get(stale._id.toString()),
    )
  })

  it('excludes what the shopper already bought or wishlisted', async () => {
    const customer = await createUser({ role: 'customer' })
    const audio = await Category.create({ name: 'Audio', slug: 'audio' })
    const bought = await catalogueItem({
      title: 'Owned',
      slug: 'owned',
      brand: 'Nova',
      categoryId: audio._id,
    })
    await purchase(customer, bought)

    const profile = await buildTasteProfile(customer._id)
    expect(profile.exclude.has(bought.product._id.toString())).toBe(true)
  })
})

describe('recommendations for you', () => {
  it("recommends within the shopper's category and explains why", async () => {
    const customer = await createUser({ role: 'customer' })
    const audio = await Category.create({ name: 'Audio', slug: 'audio' })
    const garden = await Category.create({ name: 'Garden', slug: 'garden' })

    const bought = await catalogueItem({
      title: 'Bought Headphones',
      slug: 'bought-hp',
      brand: 'Nova',
      categoryId: audio._id,
    })
    await catalogueItem({
      title: 'Other Headphones',
      slug: 'other-hp',
      brand: 'Nova',
      categoryId: audio._id,
    })
    await catalogueItem({
      title: 'Garden Hose',
      slug: 'hose',
      brand: 'Grow',
      categoryId: garden._id,
    })
    await purchase(customer, bought)

    const result = await recommendForUser(customer._id)

    expect(result.personalised).toBe(true)
    const titles = result.items.map((item) => item.title)
    expect(titles).toContain('Other Headphones')
    expect(titles).not.toContain('Garden Hose')
    // Never recommend what they already own.
    expect(titles).not.toContain('Bought Headphones')

    const recommendation = result.items.find((item) => item.title === 'Other Headphones')
    expect(recommendation.reasons.map((r) => r.code)).toContain('category_affinity')
    expect(recommendation.reasons.find((r) => r.code === 'category_affinity').label).toContain(
      'Audio',
    )
  })

  it('gives every recommendation at least one reason', async () => {
    const customer = await createUser({ role: 'customer' })
    const audio = await Category.create({ name: 'Audio', slug: 'audio' })
    const bought = await catalogueItem({
      title: 'Bought',
      slug: 'bought',
      brand: 'Nova',
      categoryId: audio._id,
    })
    for (let index = 0; index < 5; index += 1) {
      await catalogueItem({
        title: `Candidate ${index}`,
        slug: `cand-${index}`,
        brand: 'Nova',
        categoryId: audio._id,
      })
    }
    await purchase(customer, bought)

    const result = await recommendForUser(customer._id)

    expect(result.items.length).toBeGreaterThan(0)
    for (const item of result.items) {
      expect(item.reasons.length).toBeGreaterThan(0)
      for (const reason of item.reasons) {
        expect(typeof reason.code).toBe('string')
        expect(reason.label.length).toBeGreaterThan(0)
      }
    }
  })

  it('never recommends an out-of-stock product', async () => {
    const customer = await createUser({ role: 'customer' })
    const audio = await Category.create({ name: 'Audio', slug: 'audio' })
    const bought = await catalogueItem({
      title: 'Bought',
      slug: 'bought',
      brand: 'Nova',
      categoryId: audio._id,
    })
    await catalogueItem({
      title: 'Sold Out',
      slug: 'sold-out',
      brand: 'Nova',
      categoryId: audio._id,
      qty: 0,
    })
    await purchase(customer, bought)

    const result = await recommendForUser(customer._id)
    expect(result.items.map((item) => item.title)).not.toContain('Sold Out')
  })

  it('falls back to an honestly labelled popular shelf with no history', async () => {
    const customer = await createUser({ role: 'customer' })
    await catalogueItem({ title: 'Anything', slug: 'anything', brand: 'Nova' })

    const result = await recommendForUser(customer._id)

    expect(result.personalised).toBe(false)
    expect(result.strategy).toBe('popular')
    expect(result.items[0].reasons[0].code).toBe('popular')
  })
})

describe('similar products', () => {
  it('explains similarity by category, brand and price', async () => {
    const audio = await Category.create({ name: 'Audio', slug: 'audio' })
    const seed = await catalogueItem({
      title: 'Seed Headphones',
      slug: 'seed-hp',
      brand: 'Nova',
      categoryId: audio._id,
      priceMinor: 10000,
    })
    await catalogueItem({
      title: 'Sibling Headphones',
      slug: 'sibling-hp',
      brand: 'Nova',
      categoryId: audio._id,
      priceMinor: 11000,
    })

    const result = await similarProducts(seed.product._id.toString())
    const sibling = result.items.find((item) => item.title === 'Sibling Headphones')

    expect(sibling).toBeTruthy()
    const codes = sibling.reasons.map((reason) => reason.code)
    expect(codes).toContain('same_category')
    expect(codes).toContain('same_brand')
    expect(codes).toContain('similar_price')
  })

  it('never returns the seed product itself', async () => {
    const audio = await Category.create({ name: 'Audio', slug: 'audio' })
    const seed = await catalogueItem({
      title: 'Seed',
      slug: 'seed',
      brand: 'Nova',
      categoryId: audio._id,
    })
    await catalogueItem({ title: 'Other', slug: 'other', brand: 'Nova', categoryId: audio._id })

    const result = await similarProducts(seed.product._id.toString())
    expect(result.items.map((item) => item.productId)).not.toContain(seed.product._id.toString())
  })

  it('404s for an unknown product', async () => {
    await expect(similarProducts('000000000000000000000000')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('recommendation endpoints', () => {
  it('requires authentication for personalised shelves', async () => {
    const forYou = await request(app).get('/api/v1/recommendations/for-you')
    expect(forYou.status).toBe(401)

    const recent = await request(app).get('/api/v1/recommendations/recently-viewed')
    expect(recent.status).toBe(401)
  })

  it('serves similar products publicly', async () => {
    const audio = await Category.create({ name: 'Audio', slug: 'audio' })
    const seed = await catalogueItem({
      title: 'Seed',
      slug: 'seed',
      brand: 'Nova',
      categoryId: audio._id,
    })
    await catalogueItem({ title: 'Other', slug: 'other', brand: 'Nova', categoryId: audio._id })

    const response = await request(app).get(
      `/api/v1/recommendations/products/${seed.product._id}/similar`,
    )
    expect(response.status).toBe(200)
    expect(response.body.data.items.length).toBeGreaterThan(0)
  })

  it('records a view when a signed-in shopper opens a product', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await catalogueItem({ title: 'Viewed', slug: 'viewed', brand: 'Nova' })

    await request(app)
      .get(`/api/v1/products/${item.product._id}`)
      .set('Authorization', authHeader(customer))
      .expect(200)

    // The write is intentionally not awaited by the request; wait for it here.
    await flushViewWrites()

    const view = await RecentlyViewed.findOne({
      userId: customer._id,
      productId: item.product._id,
    })
    expect(view).toBeTruthy()
    expect(view.viewCount).toBe(1)
  })

  it('does not record a view for an anonymous visitor', async () => {
    const item = await catalogueItem({ title: 'Viewed', slug: 'viewed', brand: 'Nova' })

    await request(app).get(`/api/v1/products/${item.product._id}`).expect(200)
    await flushViewWrites()

    expect(await RecentlyViewed.countDocuments()).toBe(0)
  })
})
