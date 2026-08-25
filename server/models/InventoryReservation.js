import mongoose from 'mongoose'

const inventoryReservationSchema = new mongoose.Schema(
  {
    reservationKey: { type: String, required: true, unique: true, trim: true, maxlength: 160 },
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    status: {
      type: String,
      enum: ['active', 'committed', 'released', 'expired'],
      required: true,
      default: 'active',
    },
    expiresAt: { type: Date, required: true },
    releasedAt: { type: Date },
  },
  { timestamps: true },
)

inventoryReservationSchema.index({ status: 1, expiresAt: 1 })
inventoryReservationSchema.index({ sellerId: 1, variantId: 1, status: 1 })

export const InventoryReservation = mongoose.model(
  'InventoryReservation',
  inventoryReservationSchema,
)
