import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runToolLoop = vi.fn()
vi.mock('../services/ai/provider.js', () => ({
  runToolLoop: (...args) => runToolLoop(...args),
  callStructuredTool: vi.fn(),
  isAiConfigured: () => true,
  aiModel: () => 'claude-opus-5',
}))

const { app } = await import('../app.js')
const { askAdminAssistant } = await import('../services/ai/adminAssistant.js')
const { ADMIN_TOOLS, executeAdminTool } = await import('../services/ai/adminTools.js')
const { authHeader, createCatalogItem, createUser } = await import('./factories.js')

const usage = { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0 }

// Runs the real tool executor so the facts under test come from real queries.
function loopCalling(name, input, text) {
  runToolLoop.mockImplementation(async ({ executeTool }) => {
    const outcome = await executeTool(name, input)
    return { text, calls: [{ name, input, ok: outcome.ok, outcome }], usage, truncated: false }
  })
}

// Braces matter: a concise arrow would return the mock, and Vitest treats a
// function returned from beforeEach as a cleanup hook — calling it after the test.
beforeEach(() => {
  runToolLoop.mockReset()
})

describe('the tool surface is closed', () => {
  it('refuses a tool the registry does not define', async () => {
    const outcome = await executeAdminTool('run_raw_query', { filter: { $where: '1==1' } })
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toMatch(/Unknown tool/)
  })

  it('exposes only read-only tools with closed schemas', () => {
    for (const [name, tool] of Object.entries(ADMIN_TOOLS)) {
      expect(name).not.toMatch(/create|update|delete|remove|query|exec|raw/i)
      expect(tool.definition.strict).toBe(true)
      expect(tool.definition.input_schema.additionalProperties).toBe(false)
    }
  })

  it('ignores arguments outside a tool schema', async () => {
    await createCatalogItem({ quantityOnHand: 0 })
    const outcome = await executeAdminTool('get_low_stock', {
      limit: 10,
      $where: 'true',
      collection: 'users',
    })
    expect(outcome.ok).toBe(true)
    expect(outcome.result.items.length).toBeGreaterThan(0)
  })

  it('clamps an absurd limit and rejects an unbounded date range', async () => {
    const clamped = await executeAdminTool('get_low_stock', { limit: 100000 })
    expect(clamped.result.items.length).toBeLessThanOrEqual(50)

    const unbounded = await executeAdminTool('get_revenue_summary', {
      from: '1970-01-01',
      to: '2099-01-01',
    })
    expect(unbounded.ok).toBe(false)
  })
})

describe('facts are separated from analysis', () => {
  it('builds facts from tool results, keeping analysis in its own field', async () => {
    const admin = await createUser({ role: 'admin' })
    await createCatalogItem({ quantityOnHand: 0 })

    loopCalling('get_low_stock', { limit: 10 }, 'One SKU has sold out and should be prioritised.')
    const result = await askAdminAssistant(admin, 'Which products are low in stock?')

    expect(result.grounded).toBe(true)
    expect(result.dataSources[0].tool).toBe('get_low_stock')
    expect(result.facts.find((f) => f.label === 'SKUs completely out of stock').raw).toBe(1)
    expect(result.facts.every((f) => typeof f.source === 'string')).toBe(true)
    expect(result.analysis).toContain('prioritised')
  })

  it('flags a currency figure that appears only in the analysis', async () => {
    const admin = await createUser({ role: 'admin' })
    loopCalling('get_low_stock', { limit: 10 }, 'Revenue was $999,999.00 last month, a record.')

    const result = await askAdminAssistant(admin, 'How did we do?')

    expect(result.unverifiedFigures).toContain('$999,999.00')
    expect(result.caveats.join(' ')).toMatch(/not in the verified data/)
  })

  it('marks an answer ungrounded when no tool ran', async () => {
    const admin = await createUser({ role: 'admin' })
    runToolLoop.mockResolvedValue({
      text: 'Revenue is definitely growing.',
      calls: [],
      usage,
      truncated: false,
    })

    const result = await askAdminAssistant(admin, 'How are we doing?')

    expect(result.grounded).toBe(false)
    expect(result.facts).toHaveLength(0)
    expect(result.caveats.join(' ')).toMatch(/nothing here is backed by a query/)
  })
})

describe('admin assistant endpoint', () => {
  it('is admin-only', async () => {
    const anonymous = await request(app)
      .post('/api/v1/ai/admin-assistant')
      .send({ question: 'revenue?' })
    expect(anonymous.status).toBe(401)

    const customer = await createUser({ role: 'customer' })
    const asCustomer = await request(app)
      .post('/api/v1/ai/admin-assistant')
      .set('Authorization', authHeader(customer))
      .send({ question: 'revenue?' })
    expect(asCustomer.status).toBe(403)

    const { owner } = await createCatalogItem()
    const asSeller = await request(app)
      .post('/api/v1/ai/admin-assistant')
      .set('Authorization', authHeader(owner))
      .send({ question: 'revenue?' })
    expect(asSeller.status).toBe(403)
  })

  it('validates the question', async () => {
    const admin = await createUser({ role: 'admin' })
    const response = await request(app)
      .post('/api/v1/ai/admin-assistant')
      .set('Authorization', authHeader(admin))
      .send({ question: '  ' })
    expect(response.status).toBe(400)
  })
})
