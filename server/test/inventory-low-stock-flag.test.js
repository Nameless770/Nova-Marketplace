import { describe, expect, it } from 'vitest'
import { Inventory } from '../models/Inventory.js'
import { addStock } from '../services/inventoryService.js'
import { createOrderFromCart } from '../services/orderService.js'
import { address, createCart, createCatalogItem, createUser } from './factories.js'

/**
 * The low-stock listings query the denormalized `isLowStock` flag instead of
 * comparing `quantityAvailable` to `lowStockThreshold` with `$expr`, because a
 * two-field comparison cannot use an index and forces a collection scan.
 *
 * That trade is only sound while the flag agrees with the quantities it
 * summarises. These tests assert exactly that across the write paths, so drift
 * fails the build instead of quietly hiding a stock-out from a seller.
 */
async function flagState(inventoryId) {
  const row = await Inventory.findById(inventoryId).lean()
  return {
    stored: row.isLowStock,
    computed: row.quantityAvailable <= row.lowStockThreshold,
  }
}

describe('isLowStock stays consistent with the quantities it summarises', () => {
  it('is false while stock is comfortably above the threshold', async () => {
    const item = await createCatalogItem({ quantityOnHand: 50 })
    const state = await flagState(item.inventory._id)

    expect(state.stored).toBe(state.computed)
    expect(state.stored).toBe(false)
  })

  // Reserving happens inside checkout's conditional update, where the flag is
  // recomputed by an aggregation pipeline rather than in JavaScript — a
  // different code path from every other mutation, and the easiest to break.
  it('flips to true when a checkout reservation crosses the threshold', async () => {
    const customer = await createUser({ role: 'customer' })
    const item = await createCatalogItem({ quantityOnHand: 6, lowStockThreshold: 2 })
    await createCart(customer, [{ ...item, quantity: 5 }])

    await createOrderFromCart(
      customer._id,
      { shippingAddress: address, billingAddress: address },
      'low-stock-reserve-key',
    )

    const state = await flagState(item.inventory._id)
    expect(state.stored).toBe(state.computed)
    expect(state.stored).toBe(true)
  })

  it('clears again when stock is added back', async () => {
    const item = await createCatalogItem({ quantityOnHand: 1, lowStockThreshold: 2 })
    expect((await flagState(item.inventory._id)).stored).toBe(true)

    await addStock(item.owner._id, item.variant._id, {
      quantity: 100,
      commandId: 'restock-low-stock-flag',
    })

    const state = await flagState(item.inventory._id)
    expect(state.stored).toBe(state.computed)
    expect(state.stored).toBe(false)
  })

  // The guarantee the listings actually depend on: no row in the collection
  // disagrees with its own quantities.
  it('holds for every inventory row in the database', async () => {
    await createCatalogItem({ quantityOnHand: 1 })
    await createCatalogItem({ quantityOnHand: 500 })
    await createCatalogItem({ quantityOnHand: 3, lowStockThreshold: 5 })

    const rows = await Inventory.find().lean()
    const drifted = rows
      .filter((row) => row.isLowStock !== row.quantityAvailable <= row.lowStockThreshold)
      .map((row) => ({
        sku: row.sku,
        isLowStock: row.isLowStock,
        available: row.quantityAvailable,
        threshold: row.lowStockThreshold,
      }))

    expect(drifted).toEqual([])
  })
})
