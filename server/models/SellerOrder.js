import mongoose from 'mongoose'

const sellerOrderSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    sellerOrderNumber: { type: String, required: true, unique: true, trim: true },
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'refunded',
      ],
      default: 'pending',
      required: true,
    },
    subtotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    shippingMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    discountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    totalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    itemCount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  },
  { timestamps: true },
)

sellerOrderSchema.index({ sellerId: 1, createdAt: -1, _id: -1 })
sellerOrderSchema.index({ orderId: 1 })
sellerOrderSchema.index({ orderId: 1, sellerId: 1 }, { unique: true })

export const SellerOrder = mongoose.model('SellerOrder', sellerOrderSchema)
