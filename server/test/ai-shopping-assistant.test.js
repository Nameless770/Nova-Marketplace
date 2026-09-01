import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The provider is stubbed so these tests assert what the backend does with model
// output — including deliberately hostile output — without network or spend.
const callStructuredTool = vi.fn()
vi.mock('../services/ai/provider.js', () => ({
  callStructuredTool: (...args) => callStructuredTool(...args),
  isAiConfigured: () => true,
  aiModel: () => 'claude-opus-5',
}))

const { app } = await import('../app.js')
const { assist } = await import('../services/ai/shoppingAssistant.js')
const { sanitizeModelProse, validateRecommendations } = await import('../services/ai/grounding.js')
const { Product } = await import('../models/Product.js')
const { createCatalogItem, createUser, authHeader } = await import('./factories.js')

const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 }

function turn(output) {
  return { output, usage, stopReason: 'tool_use' }
}

function stubTurns(criteria, recommendation) {
  callStructuredTool.mockReset()
  callStructuredTool
    .mockResolvedValueOnce(turn(criteria))
    .mockResolvedValueOnce(turn(recommendation))
}

const baseCriteria = {
  keywords: 'wireless headphones',
  maxPrice: 100,
  minPrice: null,
  minRating: null,
  inStockOnly: false,
  qualities: ['good battery life'],
}

async function seedHeadphones() {
  const cheap = await createCatalogItem({
    title: 'Aero Wireless Headphones',
    slug: 'aero-wireless',
    priceMinor: 7999,
    quantityOnHand: 5,
  })
  await Product.updateOne(
    { _id: cheap.product._id },
    { $set: { description: 'Wireless headphones with 40 hour battery life.' } },
  )
  return cheap
}

beforeEach(() => {
  callStructuredTool.mockReset()
})

describe('shopping assistant grounding', () => {
  it('never returns a product the search did not return', async () => {
    const customer = await createUser({ role: 'customer' })
    const real = await seedHeadphones()

    stubTurns(baseCriteria, {
      message: 'Here are two great options.',
      recommendations: [
        { productId: real.product._id.toString(), reason: 'Long battery life.' },
        // A product that does not exist anywhere.
        { productId: '000000000000000000000000', reason: 'Invented by the model.' },
        { productId: 'SonyWH1000XM5', reason: 'Not even an id.' },
      ],
      noMatch: false,
    })

    const result = await assist(customer, 'wireless headphones under $100')

    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].productId).toBe(real.product._id.toString())
    expect(result.grounding.rejected).toHaveLength(2)
    expect(result.grounding.rejected.every((r) => r.cause === 'not_in_candidate_set')).toBe(true)
  })

  it('reports no match when every recommendation was invented', async () => {
    const customer = await createUser({ role: 'customer' })
    await seedHeadphones()

    stubTurns(baseCriteria, {
      message: 'I found the perfect pair for you!',
      recommendations: [{ productId: 'totally-made-up', reason: 'Great value.' }],
      noMatch: false,
    })

    const result = await assist(customer, 'wireless headphones under $100')

    expect(result.recommendations).toHaveLength(0)
    expect(result.noMatch).toBe(true)
    // The model's confident message must not survive when nothing was grounded.
    expect(result.message).not.toContain('perfect pair')
  })

  it('takes price, rating and stock from the database, not the model', async () => {
    const customer = await createUser({ role: 'customer' })
    const real = await seedHeadphones()
    await Product.updateOne(
      { _id: real.product._id },
      { $set: { ratingAverage: '4.5', ratingCount: 12 } },
    )

    stubTurns(baseCriteria, {
      message: 'Only $9.99 today, rated 5/5 stars, 999 in stock!',
      recommendations: [
        { productId: real.product._id.toString(), reason: 'Just $9.99 and rated 5 stars!' },
      ],
      noMatch: false,
    })

    const result = await assist(customer, 'wireless headphones under $100')
    const [recommendation] = result.recommendations

    // Authoritative values win over anything the model wrote.
    expect(recommendation.priceMinor).toBe(7999)
    expect(recommendation.ratingAverage).toBe(4.5)
    expect(recommendation.ratingCount).toBe(12)
    expect(recommendation.inStock).toBe(true)

    // And the model's invented figures are scrubbed from its prose.
    expect(result.message).not.toContain('$9.99')
    expect(result.message).not.toContain('5/5')
    expect(recommendation.reason).not.toContain('$9.99')
  })

  it('returns an honest empty answer when the catalogue has nothing', async () => {
    const customer = await createUser({ role: 'customer' })

    callStructuredTool.mockReset()
    callStructuredTool.mockResolvedValueOnce(turn(baseCriteria))

    const result = await assist(customer, 'wireless headphones under $100')

    expect(result.recommendations).toHaveLength(0)
    expect(result.noMatch).toBe(true)
    expect(result.grounding.candidateCount).toBe(0)
    // The second model call must not even happen when there is nothing to ground on.
    expect(callStructuredTool).toHaveBeenCalledTimes(1)
  })

  it('drops duplicate recommendations of the same product', async () => {
    const customer = await createUser({ role: 'customer' })
    const real = await seedHeadphones()
    const id = real.product._id.toString()

    stubTurns(baseCriteria, {
      message: 'Options.',
      recommendations: [
        { productId: id, reason: 'First.' },
        { productId: id, reason: 'Same product again.' },
      ],
      noMatch: false,
    })

    const result = await assist(customer, 'headphones')
    expect(result.recommendations).toHaveLength(1)
    expect(result.grounding.rejected[0].cause).toBe('duplicate')
  })
})

describe('price filtering (regression)', () => {
  // Variant products previously had no currentPriceMinor, so every price-range
  // search silently returned nothing — which made "under $100" unanswerable.
  it('finds a variant product by price range', async () => {
    const { searchProducts } = await import('../services/searchService.js')
    const item = await createCatalogItem({ priceMinor: 7999 })

    const inBudget = await searchProducts({ maxPrice: 10000 })
    const outOfBudget = await searchProducts({ maxPrice: 5000 })

    expect(inBudget.items.map((p) => p._id.toString())).toContain(item.product._id.toString())
    expect(outOfBudget.items.map((p) => p._id.toString())).not.toContain(
      item.product._id.toString(),
    )
  })
})

describe('grounding helpers', () => {
  it('strips currency and rating claims but keeps legitimate numbers', () => {
    expect(sanitizeModelProse('Only $49.99!')).toBe('Only [price]!')
    expect(sanitizeModelProse('Rated 4.5 stars')).toBe('Rated [rating]')
    expect(sanitizeModelProse('Costs 30 USD')).toBe('Costs [price]')
    // Battery hours are description, not a price or rating claim.
    expect(sanitizeModelProse('40 hours of battery')).toBe('40 hours of battery')
  })

  it('rejects malformed model output without throwing', () => {
    const result = validateRecommendations(null, new Map())
    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([])
  })
})

describe('shopping assistant endpoint', () => {
  it('requires authentication and the customer role', async () => {
    const anonymous = await request(app)
      .post('/api/v1/ai/shopping-assistant')
      .send({ query: 'headphones' })
    expect(anonymous.status).toBe(401)

    const { owner } = await createCatalogItem()
    const asSeller = await request(app)
      .post('/api/v1/ai/shopping-assistant')
      .set('Authorization', authHeader(owner))
      .send({ query: 'headphones' })
    expect(asSeller.status).toBe(403)
  })

  it('validates the query', async () => {
    const customer = await createUser({ role: 'customer' })

    const empty = await request(app)
      .post('/api/v1/ai/shopping-assistant')
      .set('Authorization', authHeader(customer))
      .send({ query: '   ' })
    expect(empty.status).toBe(400)

    const tooLong = await request(app)
      .post('/api/v1/ai/shopping-assistant')
      .set('Authorization', authHeader(customer))
      .send({ query: 'x'.repeat(501) })
    expect(tooLong.status).toBe(400)
  })

  it('answers a real request end to end', async () => {
    const customer = await createUser({ role: 'customer' })
    const real = await seedHeadphones()

    stubTurns(baseCriteria, {
      message: 'These fit your budget and last all day.',
      recommendations: [{ productId: real.product._id.toString(), reason: 'Long battery life.' }],
      noMatch: false,
    })

    const response = await request(app)
      .post('/api/v1/ai/shopping-assistant')
      .set('Authorization', authHeader(customer))
      .send({ query: 'I need wireless headphones under $100 with good battery life.' })

    expect(response.status).toBe(200)
    expect(response.body.data.recommendations).toHaveLength(1)
    expect(response.body.data.recommendations[0].title).toBe('Aero Wireless Headphones')
    expect(response.body.data.promptVersion).toBeTruthy()
    // The search actually applied the extracted budget.
    expect(response.body.data.criteria.maxPrice).toBe(10000)
  })
})
