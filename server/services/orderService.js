import mongoose from 'mongoose'
import { Cart } from '../models/Cart.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryHistory } from '../models/InventoryHistory.js'
import { InventoryReservation } from '../models/InventoryReservation.js'
import { Order } from '../models/Order.js'
import { OrderItem } from '../models/OrderItem.js'
import { Product } from '../models/Product.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { Seller } from '../models/Seller.js'
import { SellerOrder } from '../models/SellerOrder.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/errors.js'
import { calculateCoupon, reserveCoupon } from './couponService.js'

// Fulfilment order of the happy path, used to roll several seller orders up
// into the single status the customer tracks.
const STATUS_RANK = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
]

const transitions = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  // Out for delivery is the last hop before hand-off. It stays optional so a
  // seller who does not track that granularity can still go straight to
  // delivered.
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

function orderNumber() {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

// Checkout sends a map pin, so country may be absent; only normalise it when it
// is actually there. `fallbackName` fills the recipient from the account, since
// the shopper no longer types their name at checkout.
function snapshotAddress(address, fallbackName) {
  const snapshot = {
    ...address,
    firstName: address.firstName || fallbackName?.firstName,
    lastName: address.lastName || fallbackName?.lastName,
  }
  if (typeof address.country === 'string') snapshot.country = address.country.toUpperCase()
  return snapshot
}

function lineTotal(unitPriceMinor, quantity) {
  return unitPriceMinor * quantity
}

async function orderCreationResult(order, idempotentReplay = false, session = null) {
  const [sellerOrders, items] = await Promise.all([
    SellerOrder.find({ orderId: order._id }).session(session).lean(),
    OrderItem.find({ orderId: order._id }).session(session).lean(),
  ])
  return { order, sellerOrders, items, idempotentReplay }
}

async function existingOrderForKey(customerId, idempotencyKey, session = null) {
  const order = await Order.findOne({ customerId, idempotencyKey }).session(session).lean()
  return order ? orderCreationResult(order, true, session) : null
}

export async function createOrderFromCart(
  customerId,
  { shippingAddress, billingAddress, couponCode },
  idempotencyKey,
) {
  const normalizedIdempotencyKey = idempotencyKey?.trim()
  if (!normalizedIdempotencyKey || normalizedIdempotencyKey.length > 160) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required')
  }
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      const existing = await existingOrderForKey(customerId, normalizedIdempotencyKey, session)
      if (existing) {
        result = existing
        return
      }

      const cart = await Cart.findOne({ userId: customerId }).session(session)
      if (!cart || cart.items.length === 0)
        throw new AppError(409, 'CART_EMPTY', 'Cannot create an order from an empty cart')

      // The recipient name comes from the account now that checkout no longer
      // asks for it.
      const customer = await User.findById(customerId)
        .select('firstName lastName')
        .session(session)
        .lean()

      const preparedItems = []
      const sellerGroups = new Map()
      for (const cartItem of cart.items) {
        const product = await Product.findOne({ _id: cartItem.productId, status: 'active' })
          .session(session)
          .lean()
        const variant = await ProductVariant.findOne({
          _id: cartItem.variantId,
          productId: cartItem.productId,
          status: 'active',
        })
          .session(session)
          .lean()
        const seller =
          variant &&
          (await Seller.findOne({ _id: variant.sellerId, status: 'approved' })
            .session(session)
            .lean())
        if (!product || !variant || !seller)
          throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'A cart item is no longer available')

        const inventory = await Inventory.findOneAndUpdate(
          {
            variantId: variant._id,
            sellerId: seller._id,
            quantityAvailable: { $gte: cartItem.quantity },
            status: { $in: ['active', 'out_of_stock'] },
          },
          { $inc: { quantityReserved: cartItem.quantity, version: 1 }, $set: { status: 'active' } },
          { new: true, session },
        )
        if (!inventory)
          throw new AppError(409, 'INSUFFICIENT_STOCK', 'A cart item has insufficient stock')
        inventory.quantityAvailable = inventory.quantityOnHand - inventory.quantityReserved
        inventory.isLowStock = inventory.quantityAvailable <= inventory.lowStockThreshold
        await inventory.save({ session })

        const subtotalMinor = lineTotal(variant.currentPriceMinor, cartItem.quantity)
        const prepared = { cartItem, product, variant, seller, inventory, subtotalMinor }
        preparedItems.push(prepared)
        const group = sellerGroups.get(seller._id.toString()) ?? {
          seller,
          items: [],
          subtotalMinor: 0,
        }
        group.items.push(prepared)
        group.subtotalMinor += subtotalMinor
        sellerGroups.set(seller._id.toString(), group)
      }

      const subtotalMinor = preparedItems.reduce((total, item) => total + item.subtotalMinor, 0)
      const couponResult = couponCode
        ? await calculateCoupon(couponCode, customerId, preparedItems, cart.currency, session)
        : null
      const discountMinor = couponResult?.discountMinor ?? 0
      const groupDiscounts = new Map()
      let allocatedDiscount = 0
      const groups = [...sellerGroups.values()]
      groups.forEach((group, index) => {
        const amount =
          index === groups.length - 1
            ? discountMinor - allocatedDiscount
            : Math.floor((discountMinor * group.subtotalMinor) / subtotalMinor)
        groupDiscounts.set(group.seller._id.toString(), amount)
        allocatedDiscount += amount
      })
      const order = await Order.create(
        [
          {
            orderNumber: orderNumber(),
            idempotencyKey: normalizedIdempotencyKey,
            customerId,
            sellerIds: [...sellerGroups.values()].map((group) => group.seller._id),
            currency: cart.currency,
            subtotalMinor,
            shippingMinor: 0,
            discountMinor,
            taxMinor: 0,
            totalMinor: subtotalMinor - discountMinor,
            couponSnapshots: couponResult
              ? [
                  {
                    code: couponResult.coupon.code,
                    discountType: couponResult.coupon.discountType,
                    discountValue: couponResult.coupon.discountValue,
                    discountMinor,
                  },
                ]
              : [],
            shippingAddressSnapshot: snapshotAddress(shippingAddress, customer),
            billingAddressSnapshot: snapshotAddress(billingAddress ?? shippingAddress, customer),
          },
        ],
        { session },
      ).then(([created]) => created)

      const sellerOrders = new Map()
      for (const group of sellerGroups.values()) {
        const [sellerOrder] = await SellerOrder.create(
          [
            {
              orderId: order._id,
              sellerId: group.seller._id,
              sellerOrderNumber: `${order.orderNumber}-${group.seller._id.toString().slice(-6).toUpperCase()}`,
              subtotalMinor: group.subtotalMinor,
              shippingMinor: 0,
              discountMinor: groupDiscounts.get(group.seller._id.toString()),
              taxMinor: 0,
              totalMinor: group.subtotalMinor - groupDiscounts.get(group.seller._id.toString()),
              itemCount: group.items.length,
            },
          ],
          { session },
        )
        sellerOrders.set(group.seller._id.toString(), sellerOrder)
      }

      if (couponResult)
        await reserveCoupon(couponResult.coupon._id, customerId, order._id, discountMinor, session)

      const orderItems = []
      for (const item of preparedItems) {
        const sellerOrder = sellerOrders.get(item.seller._id.toString())
        const [orderItem] = await OrderItem.create(
          [
            {
              orderId: order._id,
              sellerOrderId: sellerOrder._id,
              sellerId: item.seller._id,
              productId: item.product._id,
              variantId: item.variant._id,
              productSnapshot: {
                title: item.product.title,
                brand: item.product.brand,
                imageUrl: item.product.images[0]?.url,
              },
              variantSnapshot: {
                name: item.variant.name,
                sku: item.variant.sku,
                size: item.variant.size,
                color: item.variant.color,
              },
              unitPriceMinor: item.variant.currentPriceMinor,
              quantity: item.cartItem.quantity,
              discountMinor: 0,
              taxMinor: 0,
              shippingMinor: 0,
              lineTotalMinor: item.subtotalMinor,
            },
          ],
          { session },
        )
        orderItems.push(orderItem)
        const reservationKey = `${order._id.toString()}:${item.variant._id.toString()}`
        await InventoryReservation.create(
          [
            {
              reservationKey,
              orderId: order._id,
              inventoryId: item.inventory._id,
              sellerId: item.seller._id,
              variantId: item.variant._id,
              quantity: item.cartItem.quantity,
              expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            },
          ],
          { session },
        )
        await InventoryHistory.create(
          [
            {
              inventoryId: item.inventory._id,
              sellerId: item.seller._id,
              variantId: item.variant._id,
              commandId: reservationKey,
              type: 'reserve',
              quantity: item.cartItem.quantity,
              quantityOnHandAfter: item.inventory.quantityOnHand,
              quantityReservedAfter: item.inventory.quantityReserved,
            },
          ],
          { session },
        )
      }

      cart.items = []
      await cart.save({ session })
      result = { order, sellerOrders: [...sellerOrders.values()], items: orderItems }
    })
    return result
  } catch (error) {
    if (error.code === 11000) {
      const existing = await existingOrderForKey(customerId, normalizedIdempotencyKey)
      if (existing) return existing
    }
    throw error
  } finally {
    await session.endSession()
  }
}

export async function listCustomerOrders(customerId, query) {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const filter = { customerId }
  if (query.status) filter.status = query.status
  if (query.cursor) {
    let cursor
    try {
      cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString())
    } catch {
      throw new AppError(400, 'INVALID_CURSOR', 'Invalid order cursor')
    }
    if (!mongoose.isValidObjectId(cursor.id) || !cursor.createdAt)
      throw new AppError(400, 'INVALID_CURSOR', 'Invalid order cursor')
    filter.$or = [
      { createdAt: { $lt: new Date(cursor.createdAt) } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ]
  }
  const orders = await Order.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()
  const hasMore = orders.length > limit
  const items = orders.slice(0, limit)
  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({ createdAt: items.at(-1).createdAt, id: items.at(-1)._id }),
      ).toString('base64url')
    : null
  return { items, meta: { nextCursor, hasMore } }
}

export async function getCustomerOrder(customerId, orderId) {
  const order = await Order.findOne({ _id: orderId, customerId }).lean()
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found')
  const [sellerOrders, items] = await Promise.all([
    SellerOrder.find({ orderId }).lean(),
    OrderItem.find({ orderId }).lean(),
  ])
  return { order, sellerOrders, items }
}

export async function listSellerOrders(userId, query) {
  const seller = await Seller.findOne({ ownerUserId: userId, status: 'approved' }).lean()
  if (!seller) throw new AppError(403, 'SELLER_NOT_APPROVED', 'Seller is not approved')
  const filter = { sellerId: seller._id }
  if (query.status) filter.status = query.status
  const sellerOrders = await SellerOrder.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(Number(query.limit) || 25, 100))
    .lean()
  return { items: sellerOrders, meta: { nextCursor: null, hasMore: false } }
}

export async function getSellerOrder(userId, sellerOrderId) {
  const seller = await Seller.findOne({ ownerUserId: userId, status: 'approved' }).lean()
  const sellerOrder = await SellerOrder.findOne({
    _id: sellerOrderId,
    sellerId: seller?._id,
  }).lean()
  if (!sellerOrder) throw new AppError(404, 'SELLER_ORDER_NOT_FOUND', 'Seller order not found')
  const items = await OrderItem.find({ sellerOrderId, sellerId: seller._id }).lean()
  return { sellerOrder, items }
}

export async function updateSellerOrderStatus(userId, sellerOrderId, status) {
  const seller = await Seller.findOne({ ownerUserId: userId, status: 'approved' }).lean()
  const sellerOrder = await SellerOrder.findOne({ _id: sellerOrderId, sellerId: seller?._id })
  if (!sellerOrder) throw new AppError(404, 'SELLER_ORDER_NOT_FOUND', 'Seller order not found')
  if (!transitions[sellerOrder.status]?.includes(status))
    throw new AppError(409, 'INVALID_ORDER_TRANSITION', 'Invalid seller order status transition')
  sellerOrder.status = status
  await sellerOrder.save()
  const sellerOrders = await SellerOrder.find({ orderId: sellerOrder.orderId }).lean()
  // An order spanning several sellers is only as far along as its least-advanced
  // part: if one seller has shipped and another is still packing, the customer's
  // order has not shipped. Cancelled/refunded parts are excluded so they cannot
  // hold the rest of the order back.
  const live = sellerOrders.filter((item) => !['cancelled', 'refunded'].includes(item.status))
  const parentStatus = live.length
    ? STATUS_RANK[Math.min(...live.map((item) => STATUS_RANK.indexOf(item.status)))]
    : sellerOrder.status
  // `$ne: parentStatus` makes this a no-op when the rolled-up status has not
  // moved, so the customer's tracking timeline gets one entry per real step.
  await Order.updateOne(
    {
      _id: sellerOrder.orderId,
      status: { $nin: ['cancelled', 'refunded'], $ne: parentStatus },
    },
    {
      $set: { status: parentStatus },
      $push: { statusHistory: { status: parentStatus, at: new Date() } },
    },
  )
  return sellerOrder
}
