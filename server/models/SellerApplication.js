import mongoose from 'mongoose'

const sellerApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    storeName: { type: String, required: true, trim: true, maxlength: 120 },
    businessDetails: {
      legalName: { type: String, required: true, trim: true, maxlength: 160 },
      country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
      contactEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      required: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

sellerApplicationSchema.index({ userId: 1, status: 1 })
sellerApplicationSchema.index({ status: 1, createdAt: 1 })

export const SellerApplication = mongoose.model('SellerApplication', sellerApplicationSchema)
