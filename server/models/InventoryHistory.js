import mongoose from 'mongoose'

const inventoryHistorySchema = new mongoose.Schema(
  {
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    commandId: { type: String, required: true, trim: true, maxlength: 120 },
    type: {
      type: String,
      enum: ['add', 'remove', 'reserve', 'release', 'confirm'],
      required: true,
    },
    quantity: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    quantityOnHandAfter: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    quantityReservedAfter: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    reason: { type: String, trim: true, maxlength: 300 },
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryReservation' },
  },
  { timestamps: true },
)

inventoryHistorySchema.index({ commandId: 1 }, { unique: true })
inventoryHistorySchema.index({ sellerId: 1, variantId: 1, createdAt: -1 })
inventoryHistorySchema.index({ inventoryId: 1, createdAt: -1 })

export const InventoryHistory = mongoose.model('InventoryHistory', inventoryHistorySchema)
