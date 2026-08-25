import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String, sparse: true, unique: true },
    amountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'expired', 'refunded'],
      default: 'pending',
      required: true,
    },
    failureCode: { type: String, maxlength: 120 },
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 160 },
    paidAt: { type: Date },
  },
  { timestamps: true },
)

paymentSchema.index({ orderId: 1, createdAt: -1 })
paymentSchema.index({ customerId: 1, createdAt: -1 })

export const Payment = mongoose.model('Payment', paymentSchema)
