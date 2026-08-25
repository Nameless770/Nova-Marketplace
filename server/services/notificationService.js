import mongoose from 'mongoose'
import { Notification } from '../models/Notification.js'
import { AppError } from '../utils/errors.js'

const notificationTypes = new Set([
  'order_confirmation',
  'payment_confirmation',
  'order_shipped',
  'order_delivered',
  'price_drop',
  'back_in_stock',
  'new_order',
  'low_stock',
  'product_review',
  'seller_status_change',
  'new_seller_application',
  'platform_event',
])

export async function createNotification({
  recipientUserId,
  type,
  title,
  body,
  data = {},
  relatedEntityType,
  relatedEntityId,
  eventKey,
  channel = 'in_app',
}) {
  if (!mongoose.isValidObjectId(recipientUserId))
    throw new AppError(400, 'INVALID_RECIPIENT', 'Invalid notification recipient')
  if (!notificationTypes.has(type))
    throw new AppError(400, 'INVALID_NOTIFICATION_TYPE', 'Invalid notification type')
  if (eventKey) {
    const existing = await Notification.findOne({ eventKey }).lean()
    if (existing) return existing
  }
  try {
    return await Notification.create({
      recipientUserId,
      type,
      title,
      body,
      data,
      relatedEntityType,
      relatedEntityId,
      eventKey,
      channel,
    })
  } catch (error) {
    if (error.code === 11000 && eventKey) return Notification.findOne({ eventKey }).lean()
    throw error
  }
}

export async function listNotifications(userId, query) {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const filter = { recipientUserId: userId }
  if (query.status) {
    if (!['unread', 'read'].includes(query.status))
      throw new AppError(400, 'INVALID_STATUS', 'Invalid notification status')
    filter.status = query.status
  }
  if (query.cursor) {
    let cursor
    try {
      cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString())
    } catch {
      throw new AppError(400, 'INVALID_CURSOR', 'Invalid notification cursor')
    }
    if (!cursor.createdAt || !mongoose.isValidObjectId(cursor.id))
      throw new AppError(400, 'INVALID_CURSOR', 'Invalid notification cursor')
    filter.$or = [
      { createdAt: { $lt: new Date(cursor.createdAt) } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ]
  }
  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()
  const hasMore = notifications.length > limit
  const items = notifications.slice(0, limit)
  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({ createdAt: items.at(-1).createdAt, id: items.at(-1)._id }),
      ).toString('base64url')
    : null
  const unreadCount = await Notification.countDocuments({
    recipientUserId: userId,
    status: 'unread',
  })
  return { items, unreadCount, meta: { nextCursor, hasMore } }
}

export async function markNotificationRead(userId, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientUserId: userId },
    { $set: { status: 'read', readAt: new Date() } },
    { new: true },
  ).lean()
  if (!notification) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
  return notification
}

export async function markAllNotificationsRead(userId) {
  await Notification.updateMany(
    { recipientUserId: userId, status: 'unread' },
    { $set: { status: 'read', readAt: new Date() } },
  )
}

export const notifyOrderConfirmation = (recipientUserId, orderId) =>
  createNotification({
    recipientUserId,
    type: 'order_confirmation',
    title: 'Order confirmed',
    body: 'Your order has been confirmed.',
    relatedEntityType: 'Order',
    relatedEntityId: orderId,
    eventKey: `order-confirmed:${orderId}`,
  })
export const notifyPaymentConfirmation = (recipientUserId, orderId) =>
  createNotification({
    recipientUserId,
    type: 'payment_confirmation',
    title: 'Payment confirmed',
    body: 'Your payment was successfully processed.',
    relatedEntityType: 'Order',
    relatedEntityId: orderId,
    eventKey: `payment-confirmed:${orderId}`,
  })
export const notifyNewSellerOrder = (recipientUserId, sellerOrderId) =>
  createNotification({
    recipientUserId,
    type: 'new_order',
    title: 'New order',
    body: 'You have received a new order.',
    relatedEntityType: 'SellerOrder',
    relatedEntityId: sellerOrderId,
    eventKey: `seller-order:${sellerOrderId}`,
  })
