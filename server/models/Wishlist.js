import mongoose from 'mongoose'

const wishlistItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    addedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true },
)

const wishlistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: {
      type: [wishlistItemSchema],
      validate: [(items) => items.length <= 200, 'A wishlist may contain at most 200 items'],
    },
  },
  { timestamps: true },
)

wishlistSchema.index({ userId: 1, updatedAt: -1 })

export const Wishlist = mongoose.model('Wishlist', wishlistSchema)
