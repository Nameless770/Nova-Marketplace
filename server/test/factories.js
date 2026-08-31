import bcrypt from 'bcrypt'
import { Cart } from '../models/Cart.js'
import { Category } from '../models/Category.js'
import { Coupon } from '../models/Coupon.js'
import { Inventory } from '../models/Inventory.js'
import { Product } from '../models/Product.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { Seller } from '../models/Seller.js'
import { User } from '../models/User.js'
import { createAccessToken } from '../utils/jwt.js'

let sequence = 0

export const address = {
  firstName: 'Test',
  lastName: 'Buyer',
  line1: '1 Market Street',
  city: 'Cairo',
  state: 'Cairo',
  postalCode: '11111',
  country: 'EG',
}

export function authHeader(user) {
  return `Bearer ${createAccessToken(user)}`
}

export async function createUser(overrides = {}) {
  sequence += 1
  const password = overrides.password || 'Password123!'
  return User.create({
    email: overrides.email || `user${sequence}@example.com`,
    passwordHash: await bcrypt.hash(password, 4),
    firstName: overrides.firstName || 'Test',
    lastName: overrides.lastName || 'User',
    role: overrides.role || 'customer',
    status: overrides.status || 'active',
    sellerApprovalStatus: overrides.sellerApprovalStatus || 'not_applicable',
    sellerId: overrides.sellerId,
  })
}

export async function createApprovedSeller(overrides = {}) {
  const owner =
    overrides.owner ||
    (await createUser({
      role: 'seller',
      sellerApprovalStatus: 'approved',
      email: overrides.email,
    }))
  const seller = await Seller.create({
    ownerUserId: owner._id,
    storeName: overrides.storeName || `Store ${sequence}`,
    slug: overrides.slug || `store-${sequence}`,
    status: 'approved',
    approvedAt: new Date(),
  })
  owner.sellerId = seller._id
  await owner.save()
  return { owner, seller }
}

export async function createCatalogItem(overrides = {}) {
  const { owner, seller } = overrides.sellerBundle || (await createApprovedSeller())
  const category = await Category.create({
    name: overrides.categoryName || `Category ${sequence}`,
    slug: overrides.categorySlug || `category-${sequence}`,
  })
  const product = await Product.create({
    sellerId: seller._id,
    categoryIds: [category._id],
    title: overrides.title || `Product ${sequence}`,
    slug: overrides.slug || `product-${sequence}`,
    description: 'A test product',
    brand: 'Test Brand',
    images: [{ url: 'https://example.com/product.jpg', alt: 'Product image' }],
    hasVariants: true,
    status: 'active',
  })
  const variant = await ProductVariant.create({
    productId: product._id,
    sellerId: seller._id,
    sku: overrides.sku || `SKU-${sequence}`,
    name: overrides.variantName || 'Default',
    priceMinor: overrides.priceMinor ?? 1000,
    status: 'active',
  })
  await Product.updateOne(
    { _id: product._id },
    {
      $set: {
        minPriceMinor: variant.currentPriceMinor,
        maxPriceMinor: variant.currentPriceMinor,
        // Mirrors what createVariant does, so search price filters behave in
        // tests the way they do in the running app.
        currentPriceMinor: variant.currentPriceMinor,
      },
    },
  )
  const inventory = await Inventory.create({
    sellerId: seller._id,
    productId: product._id,
    variantId: variant._id,
    sku: variant.sku,
    quantityOnHand: overrides.quantityOnHand ?? 10,
    quantityReserved: 0,
    quantityAvailable: overrides.quantityOnHand ?? 10,
    lowStockThreshold: 1,
    isLowStock: false,
    status: 'active',
  })
  return { owner, seller, category, product, variant, inventory }
}

export async function createCart(user, items) {
  return Cart.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        currency: 'USD',
        items: items.map(({ product, variant, seller, quantity = 1, unitPriceMinor }) => ({
          productId: product._id,
          variantId: variant._id,
          sellerId: seller._id,
          quantity,
          unitPriceMinor: unitPriceMinor ?? variant.currentPriceMinor,
        })),
      },
    },
    { new: true, upsert: true },
  )
}

export async function createCoupon(overrides = {}) {
  const admin = overrides.createdBy || (await createUser({ role: 'admin' }))
  return Coupon.create({
    code: overrides.code || `SAVE${sequence}`,
    ownerType: 'platform',
    discountType: overrides.discountType || 'fixed',
    discountValue: overrides.discountValue ?? 100,
    currency: 'USD',
    expiresAt: overrides.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
    usageLimit: overrides.usageLimit,
    perUserUsageLimit: overrides.perUserUsageLimit ?? 1,
    status: 'active',
    createdBy: admin._id,
  })
}
