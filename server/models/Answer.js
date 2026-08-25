import mongoose from 'mongoose'

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 3000 },
    isSellerAnswer: { type: Boolean, required: true, default: true },
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

answerSchema.index({ questionId: 1, status: 1, createdAt: 1, _id: 1 })
answerSchema.index({ sellerId: 1, status: 1, createdAt: -1, _id: -1 })

export const Answer = mongoose.model('Answer', answerSchema)
