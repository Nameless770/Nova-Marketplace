import mongoose from 'mongoose'
import { Cart } from '../models/Cart.js'
import { Inventory } from '../models/Inventory.js'
import { Product } from '../models/Product.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { Seller } from '../models/Seller.js'
import { AppError } from '../utils/errors.js'

async function currentVariant(productId, variantId) {
  if (!mongoose.isValidObjectId(productId) || !mongoose.isValidObjectId(variantId)) {
    throw new AppError(400, 'INVALID_PRODUCT_REFERENCE', 'Invalid product or variant reference')
  }
  const product = await Product.findOne({ _id: productId, status: 'active' }).lean()
  const variant = await ProductVariant.findOne({
    _id: variantId,
    productId,
    status: 'active',
  }).lean()
  if (!product || !variant)
    throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'Product or variant is unavailable')
  const seller = await Seller.findOne({ _id: variant.sellerId, status: 'approved' }).lean()
  const inventory = await Inventory.findOne({
    variantId: variant._id,
    status: { $in: ['active', 'out_of_stock'] },
  }).lean()
  if (!seller || !inventory || inventory.quantityAvailable < 1)
    throw new AppError(409, 'OUT_OF_STOCK', 'Product variant is out of stock')
  return { product, variant, seller, inventory }
}

async function getOrCreateCart(userId) {
  return Cart.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, items: [], currency: 'USD' } },
    { new: true, upsert: true },
  )
}

async function presentCart(cart) {
  const items = await Promise.all(
    cart.items.map(async (item) => {
      const product = await Product.findById(item.productId).lean()
      const variant = await ProductVariant.findById(item.variantId).lean()
      const inventory = await Inventory.findOne({ variantId: item.variantId }).lean()
      const seller = await Seller.findById(item.sellerId).lean()
      const available = Boolean(
        product?.status === 'active' &&
        variant?.status === 'active' &&
        inventory &&
        inventory.quantityAvailable > 0,
      )
      const currentPriceMinor = variant?.currentPriceMinor
      const unitPriceMinor = Number.isSafeInteger(currentPriceMinor)
        ? currentPriceMinor
        : item.unitPriceMinor
      return {
        ...item.toObject(),
        product: product
          ? {
              id: product._id,
              title: product.title,
              brand: product.brand,
              image: product.images?.[0] ?? null,
            }
          : null,
        variant: variant
          ? {
              id: variant._id,
              name: variant.name,
              sku: variant.sku,
              size: variant.size,
              color: variant.color,
            }
          : null,
        seller: seller
          ? {
              id: seller._id,
              storeName: seller.storeName,
            }
          : null,
        availability: available
          ? inventory.quantityAvailable >= item.quantity
            ? 'available'
            : 'insufficient_stock'
          : 'unavailable',
        currentPriceMinor: Number.isSafeInteger(currentPriceMinor) ? currentPriceMinor : null,
        priceChanged: available && currentPriceMinor !== item.unitPriceMinor,
        availableQuantity: available ? inventory.quantityAvailable : 0,
        lineSubtotalMinor: unitPriceMinor * item.quantity,
      }
    }),
  )
  const subtotalMinor = items.reduce((total, item) => total + item.lineSubtotalMinor, 0)
  return {
    id: cart._id,
    userId: cart.userId,
    currency: cart.currency,
    items,
    subtotalMinor,
    updatedAt: cart.updatedAt,
  }
}

export async function getCart(userId) {
  return presentCart(await getOrCreateCart(userId))
}

export async function addCartItem(userId, { productId, variantId, quantity }) {
  const { variant, seller, inventory } = await currentVariant(productId, variantId)
  const cart = await getOrCreateCart(userId)
  const existing = cart.items.find(
    (item) => item.productId.toString() === productId && item.variantId.toString() === variantId,
  )
  const nextQuantity = (existing?.quantity ?? 0) + quantity
  if (nextQuantity > inventory.quantityAvailable)
    throw new AppError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock')
  if (existing) {
    existing.quantity = nextQuantity
    existing.unitPriceMinor = variant.currentPriceMinor
  } else {
    if (cart.items.length >= 100)
      throw new AppError(409, 'CART_LIMIT_REACHED', 'Cart item limit reached')
    cart.items.push({
      productId,
      variantId,
      sellerId: seller._id,
      quantity,
      unitPriceMinor: variant.currentPriceMinor,
    })
  }
  await cart.save()
  return presentCart(cart)
}

async function findCartItem(userId, itemId) {
  if (!mongoose.isValidObjectId(itemId))
    throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found')
  const cart = await getOrCreateCart(userId)
  const item = cart.items.id(itemId)
  if (!item) throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found')
  return { cart, item }
}

export async function updateCartItem(userId, itemId, quantity) {
  const { cart, item } = await findCartItem(userId, itemId)
  const { variant, inventory } = await currentVariant(item.productId, item.variantId)
  if (quantity > inventory.quantityAvailable)
    throw new AppError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock')
  item.quantity = quantity
  item.unitPriceMinor = variant.currentPriceMinor
  await cart.save()
  return presentCart(cart)
}

export async function removeCartItem(userId, itemId) {
  const { cart, item } = await findCartItem(userId, itemId)
  item.deleteOne()
  await cart.save()
  return presentCart(cart)
}

export async function clearCart(userId) {
  const cart = await getOrCreateCart(userId)
  cart.items = []
  await cart.save()
  return presentCart(cart)
}
