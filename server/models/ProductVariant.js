import mongoose from 'mongoose'

const productVariantSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    size: { type: String, trim: true, maxlength: 40 },
    color: { type: String, trim: true, maxlength: 40 },
    options: { type: Map, of: String, default: {} },
    priceMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    currentPriceMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' },
  },
  { timestamps: true },
)

productVariantSchema.index({ sku: 1 }, { unique: true })
productVariantSchema.index({ productId: 1, status: 1 })
productVariantSchema.index({ sellerId: 1, status: 1 })

productVariantSchema.pre('validate', function calculatePrice(next) {
  this.currentPriceMinor = Math.round(this.priceMinor * (1 - this.discountPercent / 100))
  next()
})

export const ProductVariant = mongoose.model('ProductVariant', productVariantSchema)
