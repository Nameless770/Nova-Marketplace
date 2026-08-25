import mongoose from 'mongoose'
import { Seller } from '../models/Seller.js'
import { SellerApplication } from '../models/SellerApplication.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/errors.js'

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function publicSeller(seller) {
  return {
    id: seller._id,
    ownerUserId: seller.ownerUserId,
    storeName: seller.storeName,
    slug: seller.slug,
    description: seller.description,
    image: seller.image,
    status: seller.status,
    ratingAverage: seller.ratingAverage,
    ratingCount: seller.ratingCount,
    approvedAt: seller.approvedAt,
    createdAt: seller.createdAt,
    updatedAt: seller.updatedAt,
  }
}

async function getOwnedSeller(userId) {
  const seller = await Seller.findOne({ ownerUserId: userId })
  if (!seller) throw new AppError(404, 'SELLER_NOT_FOUND', 'Seller profile not found')
  return seller
}

export async function applyAsSeller(userId, { storeName, legalName, country, contactEmail }) {
  const existing = await Seller.findOne({ ownerUserId: userId })
  if (existing) throw new AppError(409, 'SELLER_PROFILE_EXISTS', 'A seller profile already exists')

  const slug = slugify(storeName)
  if (!slug)
    throw new AppError(400, 'INVALID_STORE_NAME', 'Store name must contain letters or numbers')
  if (await Seller.exists({ slug }))
    throw new AppError(409, 'STORE_NAME_EXISTS', 'That store name is unavailable')

  const session = await mongoose.startSession()
  try {
    let application
    await session.withTransaction(async () => {
      const [seller] = await Seller.create([{ ownerUserId: userId, storeName, slug }], { session })
      ;[application] = await SellerApplication.create(
        [
          {
            userId,
            sellerId: seller._id,
            storeName,
            businessDetails: {
              legalName,
              country: country.toUpperCase(),
              contactEmail: contactEmail.toLowerCase(),
            },
          },
        ],
        { session },
      )
      await User.updateOne(
        { _id: userId },
        { $set: { sellerId: seller._id, sellerApprovalStatus: 'pending' } },
        { session },
      )
    })
    return application
  } finally {
    await session.endSession()
  }
}

export async function getMySeller(userId) {
  return publicSeller(await getOwnedSeller(userId))
}

export async function updateMySeller(userId, { storeName, description, image }) {
  const seller = await getOwnedSeller(userId)
  if (seller.status === 'suspended')
    throw new AppError(403, 'SELLER_SUSPENDED', 'Suspended sellers cannot update their store')
  if (storeName !== undefined && storeName.trim() !== seller.storeName) {
    const slug = slugify(storeName)
    if (await Seller.exists({ _id: { $ne: seller._id }, slug }))
      throw new AppError(409, 'STORE_NAME_EXISTS', 'That store name is unavailable')
    seller.storeName = storeName.trim()
    seller.slug = slug
  }
  if (description !== undefined) seller.description = description.trim()
  if (image !== undefined) seller.image = image
  await seller.save()
  return publicSeller(seller)
}

export async function getMyApplication(userId) {
  const application = await SellerApplication.findOne({ userId }).sort({ createdAt: -1 }).lean()
  if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Seller application not found')
  return application
}

export async function moderateSeller(sellerId, adminId, status, reason) {
  const session = await mongoose.startSession()
  try {
    let seller
    await session.withTransaction(async () => {
      seller = await Seller.findById(sellerId).session(session)
      if (!seller) throw new AppError(404, 'SELLER_NOT_FOUND', 'Seller profile not found')
      if (status === 'approved' && seller.status === 'approved') return
      seller.status = status
      seller.rejectionReason = status === 'rejected' ? reason : undefined
      seller.suspensionReason = status === 'suspended' ? reason : undefined
      seller.approvedAt = status === 'approved' ? new Date() : seller.approvedAt
      await seller.save({ session })

      const userUpdate =
        status === 'approved'
          ? { role: 'seller', status: 'active', sellerApprovalStatus: 'approved' }
          : { sellerApprovalStatus: status === 'suspended' ? 'suspended' : status }
      await User.updateOne({ _id: seller.ownerUserId }, { $set: userUpdate }, { session })
      await SellerApplication.updateMany(
        { sellerId: seller._id, status: { $in: ['pending', 'approved'] } },
        {
          $set: {
            status,
            reviewedBy: adminId,
            reviewedAt: new Date(),
            rejectionReason: status === 'rejected' ? reason : undefined,
          },
        },
        { session },
      )
    })
    return publicSeller(seller)
  } finally {
    await session.endSession()
  }
}

export async function getSellerDashboard(userId) {
  const seller = await getOwnedSeller(userId)
  return {
    seller: publicSeller(seller),
    products: { total: 0, active: 0 },
    orders: { total: 0, pending: 0 },
    revenueMinor: 0,
  }
}

export async function getSellerProducts(userId, query) {
  await getOwnedSeller(userId)
  return { items: [], meta: { nextCursor: null, hasMore: false }, query }
}

export async function getSellerOrders(userId, query) {
  await getOwnedSeller(userId)
  return { items: [], meta: { nextCursor: null, hasMore: false }, query }
}

export async function getSellerAnalytics(userId, query) {
  await getOwnedSeller(userId)
  return {
    period: { from: query.from ?? null, to: query.to ?? null },
    metrics: { revenueMinor: 0, orders: 0, unitsSold: 0 },
  }
}
