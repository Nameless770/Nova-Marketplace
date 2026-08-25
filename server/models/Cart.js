import mongoose from 'mongoose'

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    quantity: { type: Number, required: true, min: 1, max: 999, validate: Number.isSafeInteger },
    unitPriceMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    addedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true },
)

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: {
      type: [cartItemSchema],
      validate: [(items) => items.length <= 100, 'A cart may contain at most 100 items'],
    },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },
  },
  { timestamps: true },
)

cartSchema.index({ userId: 1, updatedAt: -1 })

export const Cart = mongoose.model('Cart', cartSchema)