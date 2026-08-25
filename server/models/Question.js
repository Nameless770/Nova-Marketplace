import mongoose from 'mongoose'

const questionSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    answerCount: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'published', 'rejected', 'removed'],
      default: 'pending',
      required: true,
    },
    moderationReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

questionSchema.index({ productId: 1, status: 1, createdAt: -1, _id: -1 })
questionSchema.index({ sellerId: 1, status: 1, createdAt: -1, _id: -1 })
questionSchema.index({ customerId: 1, createdAt: -1 })

export const Question = mongoose.model('Question', questionSchema)
