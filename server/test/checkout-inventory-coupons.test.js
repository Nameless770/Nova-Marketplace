import { describe, expect, it } from 'vitest'
import { Coupon } from '../models/Coupon.js'
import { CouponRedemption } from '../models/CouponRedemption.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryReservation } from '../models/InventoryReservation.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { createOrderFromCart } from '../services/orderService.js'
import { releaseExpiredReservations, reserveStock } from '../services/inventoryService.js'
import {
  address,
  createApprovedSeller,
  createCart,
  createCatalogItem,
  createCoupon,
  createUser,
} from './factories.js'

describe('checkout transactional boundaries', () => {
  it('uses the current authoritative variant price when creating order snapshots', async () => {
    const customer = await createUser()
    const item = await createCatalogItem({ priceMinor: 1500 })
    await createCart(customer, [
      {
        product: item.product,
        variant: item.variant,
        seller: item.seller,
        quantity: 2,
        unitPriceMinor: 500,
      },
    ])

    const result = await createOrderFromCart(
      customer._id,
      { shippingAddress: address, billingAddress: address },
      'checkout-price-key',
    )

    expect(result.order.subtotalMinor).toBe(3000)
    expect(result.items[0].unitPriceMinor).toBe(1500)
    expect(result.items[0].lineTotalMinor).toBe(3000)
  })

  it('fails safely when inventory is insufficient', async () => {
    const customer = await createUser()
    const item = await createCatalogItem({ quantityOnHand: 1 })
    await createCart(customer, [
      { product: item.product, variant: item.variant, seller: item.seller, quantity: 2 },
    ])

    await expect(
      createOrderFromCart(
        customer._id,
        { shippingAddress: address, billingAddress: address },
        'insufficient-key',
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })

    await expect(Order.countDocuments()).resolves.toBe(0)
    await expect(InventoryReservation.countDocuments()).resolves.toBe(0)
    await expect(Inventory.findById(item.inventory._id).lean()).resolves.toMatchObject({
      quantityReserved: 0,
      quantityAvailable: 1,
    })
  })

  it('replays duplicate checkout requests with the same idempotency key without duplicate side effects', async () => {
    const customer = await createUser()
    const item = await createCatalogItem({ quantityOnHand: 5 })
    await createCart(customer, [
      { product: item.product, variant: item.variant, seller: item.seller, quantity: 1 },
    ])

    const first = await createOrderFromCart(
      customer._id,
      { shippingAddress: address, billingAddress: address },
      'duplicate-checkout-key',
    )
    const second = await createOrderFromCart(
      customer._id,
      { shippingAddress: address, billingAddress: address },
      'duplicate-checkout-key',
    )

    expect(second.idempotentReplay).toBe(true)
    expect(second.order._id.toString()).toBe(first.order._id.toString())
    await expect(Order.countDocuments()).resolves.toBe(1)
    await expect(InventoryReservation.countDocuments()).resolves.toBe(1)
    await expect(OrderItem.countDocuments()).resolves.toBe(1)
    await expect(Inventory.findById(item.inventory._id).lean()).resolves.toMatchObject({
      quantityReserved: 1,
      quantityAvailable: 4,
    })
  })

  it('allows different idempotency keys to create independent checkouts', async () => {
    const customer = await createUser()
    const item = await createCatalogItem({ quantityOnHand: 5 })
    await createCart(customer, [
      { product: item.product, variant: item.variant, seller: item.seller, quantity: 1 },
    ])
    await createOrderFromCart(
      customer._id,
      { shippingAddress: address, billingAddress: address },
      'first-checkout-key',
    )
    await createCart(customer, [
      { product: item.product, variant: item.variant, seller: item.seller, quantity: 1 },
    ])

    await createOrderFromCart(
      customer._id,
      { shippingAddress: address, billingAddress: address },
      'second-checkout-key',
    )

    await expect(Order.countDocuments()).resolves.toBe(2)
    await expect(InventoryReservation.countDocuments()).resolves.toBe(2)
  })
})

describe('inventory reservations', () => {
  it('does not oversell under concurrent reservation attempts', async () => {
    const sellerBundle = await createApprovedSeller()
    const item = await createCatalogItem({ sellerBundle, quantityOnHand: 1 })

    const attempts = await Promise.allSettled([
      reserveStock(sellerBundle.owner._id, item.variant._id, {
        commandId: 'reserve-one',
        reservationKey: 'reservation-one',
        quantity: 1,
      }),
      reserveStock(sellerBundle.owner._id, item.variant._id, {
        commandId: 'reserve-two',
        reservationKey: 'reservation-two',
        quantity: 1,
      }),
    ])

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    await expect(InventoryReservation.countDocuments({ status: 'active' })).resolves.toBe(1)
    await expect(Inventory.findById(item.inventory._id).lean()).resolves.toMatchObject({
      quantityReserved: 1,
      quantityAvailable: 0,
    })
  })

  it('releases expired reservations safely and idempotently', async () => {
    const sellerBundle = await createApprovedSeller()
    const item = await createCatalogItem({ sellerBundle, quantityOnHand: 2 })
    await reserveStock(sellerBundle.owner._id, item.variant._id, {
      commandId: 'expired-reserve',
      reservationKey: 'expired-reservation-key',
      quantity: 1,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })

    await expect(releaseExpiredReservations()).resolves.toMatchObject({ released: 1 })
    await expect(releaseExpiredReservations()).resolves.toMatchObject({ released: 0 })
    await expect(InventoryReservation.countDocuments({ status: 'expired' })).resolves.toBe(1)
    await expect(Inventory.findById(item.inventory._id).lean()).resolves.toMatchObject({
      quantityReserved: 0,
      quantityAvailable: 2,
    })
  })
})

describe('coupon boundaries', () => {
  it('does not exceed coupon usage limits through competing checkout requests', async () => {
    const coupon = await createCoupon({ code: 'ONEUSE', usageLimit: 1, discountValue: 100 })
    const firstCustomer = await createUser()
    const secondCustomer = await createUser()
    const firstItem = await createCatalogItem({ quantityOnHand: 5, priceMinor: 1000 })
    const secondItem = await createCatalogItem({ quantityOnHand: 5, priceMinor: 1000 })
    await createCart(firstCustomer, [
      {
        product: firstItem.product,
        variant: firstItem.variant,
        seller: firstItem.seller,
        quantity: 1,
      },
    ])
    await createCart(secondCustomer, [
      {
        product: secondItem.product,
        variant: secondItem.variant,
        seller: secondItem.seller,
        quantity: 1,
      },
    ])

    const attempts = await Promise.allSettled([
      createOrderFromCart(
        firstCustomer._id,
        { shippingAddress: address, billingAddress: address, couponCode: coupon.code },
        'coupon-key-one',
      ),
      createOrderFromCart(
        secondCustomer._id,
        { shippingAddress: address, billingAddress: address, couponCode: coupon.code },
        'coupon-key-two',
      ),
    ])

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    await expect(Coupon.findById(coupon._id).lean()).resolves.toMatchObject({ usageCount: 1 })
    await expect(CouponRedemption.countDocuments()).resolves.toBe(1)
  })

  it('prevents duplicate coupon redemptions on idempotent checkout replay', async () => {
    const coupon = await createCoupon({ code: 'REPLAY', usageLimit: 5, discountValue: 100 })
    const customer = await createUser()
    const item = await createCatalogItem({ quantityOnHand: 5, priceMinor: 1000 })
    await createCart(customer, [
      { product: item.product, variant: item.variant, seller: item.seller, quantity: 1 },
    ])

    await createOrderFromCart(
      customer._id,
      { shippingAddress: address, billingAddress: address, couponCode: coupon.code },
      'coupon-replay-key',
    )
    const replay = await createOrderFromCart(
      customer._id,
      { shippingAddress: address, billingAddress: address, couponCode: coupon.code },
      'coupon-replay-key',
    )

    expect(replay.idempotentReplay).toBe(true)
    await expect(Coupon.findById(coupon._id).lean()).resolves.toMatchObject({ usageCount: 1 })
    await expect(CouponRedemption.countDocuments()).resolves.toBe(1)
  })
})
