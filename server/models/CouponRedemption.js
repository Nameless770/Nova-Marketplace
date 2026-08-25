import mongoose from 'mongoose'

const couponRedemptionSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    discountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    status: {
      type: String,
      enum: ['reserved', 'applied', 'released'],
      required: true,
      default: 'reserved',
    },
    releasedAt: { type: Date },
  },
  { timestamps: true },
)

couponRedemptionSchema.index({ couponId: 1, orderId: 1 }, { unique: true })
couponRedemptionSchema.index({ couponId: 1, userId: 1, status: 1 })
couponRedemptionSchema.index({ userId: 1, createdAt: -1 })

export const CouponRedemption = mongoose.model('CouponRedemption', couponRedemptionSchema)
