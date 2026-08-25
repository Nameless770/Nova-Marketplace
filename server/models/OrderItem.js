import mongoose from 'mongoose'

const orderItemSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    sellerOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerOrder', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productSnapshot: {
      title: { type: String, required: true, maxlength: 180 },
      brand: { type: String, maxlength: 120 },
      imageUrl: { type: String, maxlength: 2048 },
    },
    variantSnapshot: {
      name: { type: String, required: true, maxlength: 120 },
      sku: { type: String, required: true, maxlength: 80 },
      size: { type: String, maxlength: 40 },
      color: { type: String, maxlength: 40 },
    },
    unitPriceMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    quantity: { type: Number, required: true, min: 1, max: 999, validate: Number.isSafeInteger },
    discountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    shippingMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    lineTotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    fulfillmentStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
      required: true,
    },
  },
  { timestamps: true },
)

orderItemSchema.index({ orderId: 1 })
orderItemSchema.index({ sellerOrderId: 1 })
orderItemSchema.index({ sellerId: 1, createdAt: -1 })

export const OrderItem = mongoose.model('OrderItem', orderItemSchema)
