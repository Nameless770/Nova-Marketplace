import mongoose from 'mongoose'
import { Product } from '../models/Product.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { Seller } from '../models/Seller.js'
import { Wishlist } from '../models/Wishlist.js'
import { AppError } from '../utils/errors.js'

async function getOrCreateWishlist(userId) {
  return Wishlist.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, items: [] } },
    { new: true, upsert: true },
  )
}

async function validateProduct(productId, variantId) {
  const product = await Product.findOne({ _id: productId, status: 'active' }).lean()
  if (!product) throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'Product is unavailable')

  const variant = variantId
    ? await ProductVariant.findOne({ _id: variantId, productId, status: 'active' }).lean()
    : null
  if (variantId && !variant)
    throw new AppError(409, 'VARIANT_UNAVAILABLE', 'Product variant is unavailable')

  const sellerId = variant?.sellerId ?? product.sellerId
  const seller = await Seller.findOne({ _id: sellerId, status: 'approved' }).lean()
  if (!seller) throw new AppError(409, 'SELLER_UNAVAILABLE', 'Seller is unavailable')
  return { product, variant, sellerId }
}

async function presentWishlist(wishlist) {
  const items = await Promise.all(
    wishlist.items.map(async (item) => {
      const product = await Product.findById(item.productId).lean()
      const variant = item.variantId ? await ProductVariant.findById(item.variantId).lean() : null
      const seller = await Seller.findById(item.sellerId).lean()
      const available = Boolean(
        product?.status === 'active' &&
        (!item.variantId || variant?.status === 'active') &&
        seller?.status === 'approved',
      )
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
        availability: available ? 'available' : 'unavailable',
        currentPriceMinor: variant?.currentPriceMinor ?? product?.currentPriceMinor ?? null,
      }
    }),
  )
  return { id: wishlist._id, userId: wishlist.userId, items, updatedAt: wishlist.updatedAt }
}

export async function getWishlist(userId) {
  return presentWishlist(await getOrCreateWishlist(userId))
}

export async function addWishlistItem(userId, { productId, variantId }) {
  const { sellerId } = await validateProduct(productId, variantId)
  const wishlist = await getOrCreateWishlist(userId)
  const duplicate = wishlist.items.some(
    (item) =>
      item.productId.toString() === productId &&
      (item.variantId?.toString() ?? null) === (variantId ?? null),
  )
  if (duplicate) throw new AppError(409, 'WISHLIST_DUPLICATE', 'Product is already in the wishlist')
  if (wishlist.items.length >= 200)
    throw new AppError(409, 'WISHLIST_LIMIT_REACHED', 'Wishlist item limit reached')

  const updated = await Wishlist.findOneAndUpdate(
    {
      _id: wishlist._id,
      items: {
        $not: {
          $elemMatch: {
            productId,
            ...(variantId ? { variantId } : { variantId: { $exists: false } }),
          },
        },
      },
    },
    { $push: { items: { productId, ...(variantId ? { variantId } : {}), sellerId } } },
    { new: true },
  )
  if (!updated) throw new AppError(409, 'WISHLIST_DUPLICATE', 'Product is already in the wishlist')
  return presentWishlist(updated)
}

export async function removeWishlistItem(userId, itemId) {
  if (!mongoose.isValidObjectId(itemId))
    throw new AppError(404, 'WISHLIST_ITEM_NOT_FOUND', 'Wishlist item not found')
  const updated = await Wishlist.findOneAndUpdate(
    { userId, 'items._id': itemId },
    { $pull: { items: { _id: itemId } } },
    { new: true },
  )
  if (!updated) throw new AppError(404, 'WISHLIST_ITEM_NOT_FOUND', 'Wishlist item not found')
  return presentWishlist(updated)
}
