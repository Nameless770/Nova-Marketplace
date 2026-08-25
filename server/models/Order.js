import mongoose from 'mongoose'

const addressSnapshotSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
  },
  { _id: false },
)

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }], required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      required: true,
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
orderSchema.index({ sellerIds: 1, createdAt: -1 })
orderSchema.index({ status: 1, createdAt: -1 })

export const Order = mongoose.model('Order', orderSchema)
