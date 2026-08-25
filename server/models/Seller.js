import mongoose from 'mongoose'

const sellerSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    storeName: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 140,
    },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    image: {
      url: { type: String, trim: true, maxlength: 2048 },
      storageKey: { type: String, trim: true, maxlength: 512 },
      alt: { type: String, trim: true, maxlength: 160 },
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
      required: true,
    },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    suspensionReason: { type: String, trim: true, maxlength: 500 },
    ratingAverage: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    approvedAt: { type: Date },
  },
  { timestamps: true },
)

sellerSchema.index({ status: 1, createdAt: -1 })

export const Seller = mongoose.model('Seller', sellerSchema)
