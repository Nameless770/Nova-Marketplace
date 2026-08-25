import mongoose from 'mongoose'

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    storageKey: { type: String, trim: true, maxlength: 512 },
    alt: { type: String, trim: true, maxlength: 160, default: '' },
  },
  { _id: false },
)

const productSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    categoryIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      required: true,
      validate: [
        (categories) => categories.length > 0 && categories.length <= 5,
        'Use 1 to 5 categories',
      ],
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    brand: { type: String, trim: true, maxlength: 120, default: '' },
    images: {
      type: [imageSchema],
      required: true,
      validate: [(images) => images.length > 0 && images.length <= 12, 'Use 1 to 12 images'],
    },
    attributes: { type: Map, of: String, default: {} },
    hasVariants: { type: Boolean, required: true, default: false },
    priceMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    currentPriceMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
    minPriceMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
    maxPriceMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
    ratingAverage: { type: mongoose.Schema.Types.Decimal128, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'active', 'rejected', 'removed'],
      default: 'draft',
      required: true,
    },
  },
  { timestamps: true },
)

productSchema.index({ sellerId: 1, slug: 1 }, { unique: true })
productSchema.index({ sellerId: 1, status: 1, createdAt: -1, _id: -1 })
productSchema.index({ categoryIds: 1, status: 1, createdAt: -1, _id: -1 })
productSchema.index({ status: 1, currentPriceMinor: 1 })
productSchema.index({ status: 1, ratingAverage: -1 })
productSchema.index({ title: 'text', description: 'text', brand: 'text' })

productSchema.pre('validate', function validatePricing(next) {
  if (!this.hasVariants && this.priceMinor === undefined)
    return next(new Error('priceMinor is required without variants'))
  if (this.hasVariants && this.priceMinor !== undefined)
    return next(new Error('priceMinor is not allowed with variants'))
  if (!this.hasVariants) {
    this.currentPriceMinor = Math.round(this.priceMinor * (1 - this.discountPercent / 100))
    this.minPriceMinor = this.currentPriceMinor
    this.maxPriceMinor = this.currentPriceMinor
  }
  if (
    this.minPriceMinor !== undefined &&
    this.maxPriceMinor !== undefined &&
    this.minPriceMinor > this.maxPriceMinor
  )
    return next(new Error('minPriceMinor cannot exceed maxPriceMinor'))
  next()
})

export const Product = mongoose.model('Product', productSchema)
