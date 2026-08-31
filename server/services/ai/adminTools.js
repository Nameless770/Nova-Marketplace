import {
  getPlatformOverview,
  getTopProducts,
  listPlatformInventory,
  listPlatformOrders,
} from '../adminService.js'
import { formatMinor } from './format.js'

/**
 * The complete set of data the admin assistant can reach.
 *
 * Each entry is a thin wrapper over a service that already exists and already
 * enforces admin authorization. The model chooses which to call and with what
 * dates; it cannot express a query, a field name, a collection, or a filter that
 * is not a parameter below.
 *
 * Every tool also declares how to turn its own result into verified facts, so
 * the figures shown to an administrator come from the database rather than from
 * the model's prose.
 */

const DATE = {
  type: ['string', 'null'],
  description: 'ISO-8601 date, e.g. "2026-08-01". Null means the default window.',
}

function isoOrUndefined(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function boundedLimit(value, fallback, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), 1), max)
}

// Validated once, here, so no executor has to trust the model's arguments.
function periodArgs(input) {
  return { from: isoOrUndefined(input?.from), to: isoOrUndefined(input?.to) }
}

function fact(label, value, source, extra = {}) {
  return { label, value, source, ...extra }
}

export const ADMIN_TOOLS = {
  get_revenue_summary: {
    definition: {
      name: 'get_revenue_summary',
      description:
        'Platform revenue, order counts and refunds for a period. Use for questions about how much money was made.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { from: DATE, to: DATE },
        required: ['from', 'to'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const overview = await getPlatformOverview(periodArgs(input))
      return {
        period: overview.period,
        netRevenueMinor: overview.revenue.periodMinor,
        allTimeNetRevenueMinor: overview.revenue.allTimeMinor,
        grossAllTimeMinor: overview.revenue.grossAllTimeMinor,
        refundedAllTimeMinor: overview.revenue.refundedAllTimeMinor,
        paidOrdersInPeriod: overview.revenue.paidOrdersInPeriod,
        totalOrders: overview.orders.total,
        ordersByStatus: overview.orders.byStatus,
        dailySeries: overview.series,
      }
    },
    facts(result) {
      return [
        fact('Net revenue (period)', formatMinor(result.netRevenueMinor), 'get_revenue_summary', {
          raw: result.netRevenueMinor,
        }),
        fact('Paid orders (period)', String(result.paidOrdersInPeriod), 'get_revenue_summary', {
          raw: result.paidOrdersInPeriod,
        }),
        fact('Net revenue (all time)', formatMinor(result.allTimeNetRevenueMinor), 'get_revenue_summary', {
          raw: result.allTimeNetRevenueMinor,
        }),
        fact('Refunded (all time)', formatMinor(result.refundedAllTimeMinor), 'get_revenue_summary', {
          raw: result.refundedAllTimeMinor,
        }),
      ]
    },
  },

  get_top_products: {
    definition: {
      name: 'get_top_products',
      description:
        'Best-selling products across the platform for a period, by units sold. Use for "best sellers" questions.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { from: DATE, to: DATE, limit: { type: ['integer', 'null'] } },
        required: ['from', 'to', 'limit'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      return getTopProducts({ ...periodArgs(input), limit: boundedLimit(input?.limit, 5, 20) })
    },
    facts(result) {
      return result.items.map((item, index) =>
        fact(
          `#${index + 1} best seller`,
          `${item.title} — ${item.unitsSold} units, ${formatMinor(item.revenueMinor)}`,
          'get_top_products',
          { raw: item.revenueMinor },
        ),
      )
    },
  },

  get_top_sellers: {
    definition: {
      name: 'get_top_sellers',
      description: 'Sellers ranked by revenue. Use for questions about which stores perform best.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { from: DATE, to: DATE },
        required: ['from', 'to'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const overview = await getPlatformOverview(periodArgs(input))
      return { period: overview.period, sellers: overview.topSellers }
    },
    facts(result) {
      return result.sellers.map((seller, index) =>
        fact(
          `#${index + 1} seller by revenue`,
          `${seller.storeName} — ${formatMinor(seller.revenueMinor)} from ${seller.unitsSold} units`,
          'get_top_sellers',
          { raw: seller.revenueMinor },
        ),
      )
    },
  },

  get_low_stock: {
    definition: {
      name: 'get_low_stock',
      description:
        'Inventory at or below its low-stock threshold, lowest availability first. Use for restocking questions.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { limit: { type: ['integer', 'null'] } },
        required: ['limit'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const result = await listPlatformInventory({
        lowStock: 'true',
        limit: boundedLimit(input?.limit, 10, 50),
      })
      return {
        totalLowStock: result.meta.total,
        items: result.items.map((row) => ({
          sku: row.sku,
          quantityAvailable: row.quantityAvailable,
          lowStockThreshold: row.lowStockThreshold,
          status: row.status,
        })),
      }
    },
    facts(result) {
      const outOfStock = result.items.filter((item) => item.quantityAvailable === 0).length
      return [
        fact('SKUs at or below threshold', String(result.totalLowStock), 'get_low_stock', {
          raw: result.totalLowStock,
        }),
        fact('SKUs completely out of stock', String(outOfStock), 'get_low_stock', {
          raw: outOfStock,
        }),
      ]
    },
  },

  get_order_breakdown: {
    definition: {
      name: 'get_order_breakdown',
      description:
        'Counts of orders by status and payment status. Use for questions about fulfilment or unpaid orders.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { status: { type: ['string', 'null'] }, paymentStatus: { type: ['string', 'null'] } },
        required: ['status', 'paymentStatus'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const overview = await getPlatformOverview({})
      // Enum-checked: an unrecognised status is dropped rather than queried.
      const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
      const payments = ['pending', 'paid', 'failed', 'partially_refunded', 'refunded']
      const filtered = await listPlatformOrders({
        limit: 1,
        ...(statuses.includes(input?.status) ? { status: input.status } : {}),
        ...(payments.includes(input?.paymentStatus) ? { paymentStatus: input.paymentStatus } : {}),
      })
      return {
        totalOrders: overview.orders.total,
        byStatus: overview.orders.byStatus,
        matchingFilter: filtered.meta.total,
      }
    },
    facts(result) {
      return [
        fact('Total orders', String(result.totalOrders), 'get_order_breakdown', {
          raw: result.totalOrders,
        }),
        ...Object.entries(result.byStatus).map(([status, count]) =>
          fact(`Orders — ${status}`, String(count), 'get_order_breakdown', { raw: count }),
        ),
      ]
    },
  },
}

export const ADMIN_TOOL_DEFINITIONS = Object.values(ADMIN_TOOLS).map((tool) => tool.definition)

/**
 * Runs a tool by name. An unknown name is refused rather than executed, so a
 * model that invents a tool gets an error result instead of reaching anything.
 */
export async function executeAdminTool(name, input) {
  const tool = ADMIN_TOOLS[name]
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` }
  try {
    const result = await tool.execute(input ?? {})
    return { ok: true, result, facts: tool.facts(result) }
  } catch (error) {
    return { ok: false, error: error.message ?? 'Tool execution failed' }
  }
}
