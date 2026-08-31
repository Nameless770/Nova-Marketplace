import mongoose from 'mongoose'

// One document per (user, product) rather than an array on the user, because a
// view log grows without bound and would eventually outgrow the document limit.
// The TTL index keeps the collection bounded over time.
const recentlyViewedSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    categoryIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }], default: [] },
    brand: { type: String, trim: true, maxlength: 120 },
    priceMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
    viewCount: { type: Number, required: true, min: 1, default: 1 },
    lastViewedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
)

recentlyViewedSchema.index({ userId: 1, productId: 1 }, { unique: true })
recentlyViewedSchema.index({ userId: 1, lastViewedAt: -1 })
// Views older than 90 days stop being a useful taste signal and are discarded.
recentlyViewedSchema.index({ lastViewedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

export const RecentlyViewed = mongoose.model('RecentlyViewed', recentlyViewedSchema)
