import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { Cart } from '../models/Cart.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { authHeader, createCatalogItem, createUser } from './factories.js'

/**
 * The cart is where a shopper's input meets money. The risk is not that the
 * cart breaks — it is that a client can talk the server into a price.
 */
function addToCart(actor, body) {
  return request(app).post('/api/v1/cart/items').set('Authorization', authHeader(actor)).send(body)
}

describe('cart pricing is server-authoritative', () => {
  it('ignores any price supplied by the client', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem({ priceMinor: 9999 })

    const response = await addToCart(customer, {
      productId: item.product._id.toString(),
      variantId: item.variant._id.toString(),
      quantity: 1,
      // A client trying to set its own price.
      unitPriceMinor: 1,
      priceMinor: 1,
      lineSubtotalMinor: 1,
    })

    expect(response.status).toBe(201)
    const cart = await Cart.findOne({ userId: customer._id })
    expect(cart.items[0].unitPriceMinor).toBe(9999)
  })

  it('re-reads the price when the seller changes it', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem({ priceMinor: 5000 })

    await addToCart(customer, {
      productId: item.product._id.toString(),
      variantId: item.variant._id.toString(),
      quantity: 1,
    }).expect(201)

    // Seller raises the price after the item is already in the cart.
    const variant = await ProductVariant.findById(item.variant._id)
    variant.priceMinor = 7500
    await variant.save()

    const view = await request(app).get('/api/v1/cart').set('Authorization', authHeader(customer))

    const line = view.body.data.cart.items[0]
    expect(line.currentPriceMinor).toBe(7500)
    expect(line.priceChanged).toBe(true)
  })

  it('recomputes the subtotal from quantity and current price', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem({ priceMinor: 2500, quantityOnHand: 10 })

    await addToCart(customer, {
      productId: item.product._id.toString(),
      variantId: item.variant._id.toString(),
      quantity: 3,
    }).expect(201)

    const view = await request(app).get('/api/v1/cart').set('Authorization', authHeader(customer))

    expect(view.body.data.cart.subtotalMinor).toBe(7500)
  })
})

describe('cart validation', () => {
  it('rejects a non-positive or oversized quantity', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()

    for (const quantity of [0, -1, 1000, 2.5]) {
      const response = await addToCart(customer, {
        productId: item.product._id.toString(),
        variantId: item.variant._id.toString(),
        quantity,
      })
      expect(response.status, `quantity ${quantity}`).toBe(400)
    }
  })

  it('rejects a malformed product or variant id', async () => {
    const customer = await createUser({ role: 'customer' })
    const response = await addToCart(customer, {
      productId: 'not-an-id',
      variantId: 'also-not',
      quantity: 1,
    })
    expect(response.status).toBe(400)
  })

  it('rejects a variant that does not belong to the product', async () => {
    const customer = await createUser({ role: 'customer' })
    const a = await createCatalogItem({ slug: 'a' })
    const b = await createCatalogItem({ slug: 'b' })

    const response = await addToCart(customer, {
      productId: a.product._id.toString(),
      variantId: b.variant._id.toString(),
      quantity: 1,
    })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await Cart.countDocuments({ userId: customer._id, 'items.0': { $exists: true } })).toBe(
      0,
    )
  })
})

describe('cart isolation', () => {
  it("never exposes one shopper's cart to another", async () => {
    const mine = await createUser({ role: 'customer' })
    const theirs = await createUser({ role: 'customer' })
    const item = await createCatalogItem()

    await addToCart(mine, {
      productId: item.product._id.toString(),
      variantId: item.variant._id.toString(),
      quantity: 2,
    }).expect(201)

    const otherView = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', authHeader(theirs))

    expect(otherView.status).toBe(200)
    expect(otherView.body.data.cart.items).toHaveLength(0)
  })

  it("never lets a shopper remove another shopper's cart line", async () => {
    const mine = await createUser({ role: 'customer' })
    const theirs = await createUser({ role: 'customer' })
    const item = await createCatalogItem()

    await addToCart(mine, {
      productId: item.product._id.toString(),
      variantId: item.variant._id.toString(),
      quantity: 1,
    }).expect(201)

    const cart = await Cart.findOne({ userId: mine._id })
    const lineId = cart.items[0]._id.toString()

    const response = await request(app)
      .delete(`/api/v1/cart/items/${lineId}`)
      .set('Authorization', authHeader(theirs))

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect((await Cart.findOne({ userId: mine._id })).items).toHaveLength(1)
  })

  it('requires authentication for every cart operation', async () => {
    expect((await request(app).get('/api/v1/cart')).status).toBe(401)
    expect((await request(app).post('/api/v1/cart/items').send({})).status).toBe(401)
    expect((await request(app).delete('/api/v1/cart')).status).toBe(401)
  })
})
