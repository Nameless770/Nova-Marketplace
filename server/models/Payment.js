import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // How this payment is collected. `cash` is settled on delivery and has no
    // external processor; `stripe` is a card payment. Every downstream decision
    // — above all how a refund is issued — dispatches on this field rather than
    // guessing from whether an id happens to look like a Stripe one.
    provider: {
      type: String,
      enum: ['cash', 'stripe'],
      default: 'cash',
      required: true,
    },
    // Provider-neutral identifiers. For `cash` the session id is generated
    // locally; for `stripe` these hold the Checkout session and payment intent.
    providerSessionId: { type: String, required: true, unique: true },
    providerCheckoutUrl: { type: String, maxlength: 2048 },
    providerPaymentIntentId: { type: String, sparse: true, unique: true },
    amountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded'],
      default: 'pending',
      required: true,
    },
    // Running total of succeeded + in-flight refunds. The conditional update that
    // increments this is what makes over-refunding impossible under concurrency.
    refundedMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
      default: 0,
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
