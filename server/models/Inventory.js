import mongoose from 'mongoose'

const inventorySchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductVariant',
      required: true,
      unique: true,
    },
    sku: { type: String, required: true, trim: true, uppercase: true },
    quantityOnHand: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    quantityReserved: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    quantityAvailable: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    lowStockThreshold: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
      default: 5,
    },
    isLowStock: { type: Boolean, required: true, default: false },
    status: { type: String, enum: ['active', 'out_of_stock', 'disabled'], default: 'active' },
    version: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, default: 0 },
  },
  { timestamps: true },
)

inventorySchema.index({ sellerId: 1, status: 1, updatedAt: -1 })
inventorySchema.index({ sellerId: 1, isLowStock: 1, updatedAt: -1 })

export const Inventory = mongoose.model('Inventory', inventorySchema)
