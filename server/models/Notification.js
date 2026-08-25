import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
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
      ],
      required: true,
    },
    channel: {
      type: String,
      enum: ['in_app', 'email', 'sms', 'push'],
      default: 'in_app',
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    data: { type: Map, of: String, default: {} },
    relatedEntityType: { type: String, trim: true, maxlength: 60 },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: ['unread', 'read'], default: 'unread', required: true },
    readAt: { type: Date },
    eventKey: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
)

notificationSchema.index({ recipientUserId: 1, status: 1, createdAt: -1, _id: -1 })
notificationSchema.index({ recipientUserId: 1, createdAt: -1, _id: -1 })
notificationSchema.index({ eventKey: 1 }, { unique: true, sparse: true })

export const Notification = mongoose.model('Notification', notificationSchema)
