import mongoose from 'mongoose'

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, trim: true },
    eventId: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['processing', 'processed', 'failed'],
      default: 'processing',
      required: true,
    },
    errorMessage: { type: String, maxlength: 500 },
    processedAt: { type: Date },
  },
  { timestamps: true },
)

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true })
webhookEventSchema.index({ status: 1, createdAt: 1 })

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema)
