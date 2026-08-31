import mongoose from 'mongoose'

const refundItemSchema = new mongoose.Schema(
  {
    orderItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem', required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    amountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false },
)

const refundSchema = new mongoose.Schema(
  {
    refundNumber: { type: String, required: true, unique: true, trim: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    // Present when a seller refunds their own portion of a multi-vendor order.
    sellerOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerOrder' },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initiatorRole: { type: String, enum: ['admin', 'seller'], required: true },

    amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },

    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed'],
      default: 'pending',
      required: true,
    },
    failureReason: { type: String, trim: true, maxlength: 500 },

    // Whether the refunded units are returned to sellable stock.
    restock: { type: Boolean, required: true, default: false },
    restockedAt: { type: Date },

    items: { type: [refundItemSchema], default: [] },

    // Which seller bears which share of this refund. A seller-initiated refund
    // has exactly one entry; an admin refund on a multi-vendor order is split
    // proportionally, the same way order-level coupon discounts are allocated.
    allocations: {
      type: [
        {
          _id: false,
          sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
          sellerOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerOrder' },
          amountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
        },
      ],
      default: [],
    },

    stripeRefundId: { type: String, sparse: true, unique: true, maxlength: 255 },
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 160 },
    processedAt: { type: Date },
  },
  { timestamps: true },
)

refundSchema.index({ orderId: 1, createdAt: -1 })
refundSchema.index({ sellerId: 1, createdAt: -1, _id: -1 })
refundSchema.index({ paymentId: 1, status: 1 })

export const Refund = mongoose.model('Refund', refundSchema)
