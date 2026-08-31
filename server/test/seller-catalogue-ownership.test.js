import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { Product } from '../models/Product.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { authHeader, createCatalogItem, createUser } from './factories.js'

/**
 * Multi-vendor isolation on the catalogue itself. A seller reaching another
 * seller's product is both a data breach and a way to sabotage a competitor's
 * price or stock, so every write path is checked from the wrong account.
 */
describe('catalogue ownership', () => {
  it("never lets a seller edit another seller's product", async () => {
    const mine = await createCatalogItem({ title: 'My Product', slug: 'mine' })
    const outsider = await createCatalogItem({ slug: 'theirs' })

    const response = await request(app)
      .patch(`/api/v1/products/seller/${mine.product._id}`)
      .set('Authorization', authHeader(outsider.owner))
      .send({ title: 'Hijacked' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect((await Product.findById(mine.product._id)).title).toBe('My Product')
  })

  it("never lets a seller delete another seller's product", async () => {
    const mine = await createCatalogItem({ slug: 'mine' })
    const outsider = await createCatalogItem({ slug: 'theirs' })

    const response = await request(app)
      .delete(`/api/v1/products/seller/${mine.product._id}`)
      .set('Authorization', authHeader(outsider.owner))

    expect(response.status).toBeGreaterThanOrEqual(400)
    const survived = await Product.findById(mine.product._id)
    expect(survived.status).not.toBe('removed')
  })

  it("never lets a seller add a variant to another seller's product", async () => {
    const mine = await createCatalogItem({ slug: 'mine' })
    const outsider = await createCatalogItem({ slug: 'theirs' })
    const before = await ProductVariant.countDocuments({ productId: mine.product._id })

    const response = await request(app)
      .post(`/api/v1/products/seller/${mine.product._id}/variants`)
      .set('Authorization', authHeader(outsider.owner))
      .send({ sku: 'HIJACK-1', name: 'Injected', priceMinor: 1 })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await ProductVariant.countDocuments({ productId: mine.product._id })).toBe(before)
  })

  it("never lets a seller reprice another seller's variant", async () => {
    const mine = await createCatalogItem({ slug: 'mine', priceMinor: 9999 })
    const outsider = await createCatalogItem({ slug: 'theirs' })

    const response = await request(app)
      .patch(`/api/v1/products/seller/${mine.product._id}/variants/${mine.variant._id}`)
      .set('Authorization', authHeader(outsider.owner))
      .send({ priceMinor: 1 })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect((await ProductVariant.findById(mine.variant._id)).priceMinor).toBe(9999)
  })

  it('rejects catalogue writes from customers entirely', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem()

    const create = await request(app)
      .post('/api/v1/products/seller')
      .set('Authorization', authHeader(customer))
      .send({ title: 'Customer product', description: 'x' })
    expect(create.status).toBe(403)

    const edit = await request(app)
      .patch(`/api/v1/products/seller/${item.product._id}`)
      .set('Authorization', authHeader(customer))
      .send({ title: 'Nope' })
    expect(edit.status).toBe(403)
  })

  it('requires authentication for catalogue writes', async () => {
    const item = await createCatalogItem()
    const response = await request(app)
      .patch(`/api/v1/products/seller/${item.product._id}`)
      .send({ title: 'Anonymous' })
    expect(response.status).toBe(401)
  })
})
