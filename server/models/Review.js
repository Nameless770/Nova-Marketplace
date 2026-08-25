import mongoose from 'mongoose'

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    storageKey: { type: String, trim: true, maxlength: 512 },
    alt: { type: String, trim: true, maxlength: 160, default: '' },
  },
  { _id: false },
)

const reviewSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem', required: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    title: { type: String, trim: true, maxlength: 160, default: '' },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
    images: {
      type: [imageSchema],
      validate: [(images) => images.length <= 6, 'Use at most 6 images'],
    },
    verifiedPurchase: { type: Boolean, required: true, default: false },
    status: {
      type: String,
      enum: ['pending', 'published', 'rejected', 'removed'],
      default: 'pending',
      required: true,
    },
    moderationReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

reviewSchema.index({ customerId: 1, productId: 1 }, { unique: true })
reviewSchema.index({ productId: 1, status: 1, createdAt: -1, _id: -1 })
reviewSchema.index({ sellerId: 1, status: 1, createdAt: -1 })

export const Review = mongoose.model('Review', reviewSchema)
