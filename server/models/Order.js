import mongoose from 'mongoose'

const addressSnapshotSchema = new mongoose.Schema(
  {
    // Checkout now captures a map pin rather than a typed address: the shopper's
    // name comes from their account and the rest is reverse-geocoded from the
    // chosen point, so every text field is optional and may be absent.
    firstName: { type: String, trim: true, maxlength: 80 },
    lastName: { type: String, trim: true, maxlength: 80 },
    line1: { type: String, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    postalCode: { type: String, trim: true, maxlength: 20 },
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2 },
    // The delivery point itself — this is the authoritative destination now.
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
  },
  { _id: false },
)

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    idempotencyKey: { type: String, trim: true, maxlength: 160 },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }], required: true },
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'refunded',
      ],
      default: 'pending',
      required: true,
    },
    // Append-only trail of every status the order has been through, so the
    // customer sees when each step happened rather than just where it is now.
    statusHistory: {
      type: [
        {
          _id: false,
          status: { type: String, required: true },
          at: { type: Date, required: true, default: Date.now },
        },
      ],
      default: () => [{ status: 'pending', at: new Date() }],
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'partially_refunded', 'refunded'],
      default: 'pending',
      required: true,
    },
    refundedMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
      default: 0,
    },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    subtotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    shippingMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    discountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    totalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    couponSnapshots: {
      type: [{ code: String, discountType: String, discountValue: Number, discountMinor: Number }],
      validate: [(coupons) => coupons.length <= 5, 'An order may use at most 5 coupons'],
    },
    shippingAddressSnapshot: { type: addressSnapshotSchema, required: true },
    billingAddressSnapshot: { type: addressSnapshotSchema, required: true },
    placedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
)

orderSchema.index({ customerId: 1, createdAt: -1, _id: -1 })
orderSchema.index(
  { customerId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } },
)
orderSchema.index({ sellerIds: 1, createdAt: -1 })
orderSchema.index({ status: 1, createdAt: -1 })

export const Order = mongoose.model('Order', orderSchema)
