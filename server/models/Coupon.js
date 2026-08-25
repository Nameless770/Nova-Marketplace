import mongoose from 'mongoose'

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    ownerType: { type: String, enum: ['platform', 'seller'], required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, refPath: 'ownerType' },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    maximumDiscountMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
    minimumOrderMinor: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3 },
    startsAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    usageLimit: { type: Number, min: 1, validate: Number.isSafeInteger },
    usageCount: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
      default: 0,
    },
    perUserUsageLimit: { type: Number, min: 1, validate: Number.isSafeInteger, default: 1 },
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired'],
      default: 'active',
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

couponSchema.index({ code: 1 }, { unique: true })
couponSchema.index({ ownerId: 1, status: 1, createdAt: -1 })
couponSchema.index({ status: 1, startsAt: 1, expiresAt: 1 })

export const Coupon = mongoose.model('Coupon', couponSchema)
