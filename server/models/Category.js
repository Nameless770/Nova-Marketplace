import mongoose from 'mongoose'

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' },
    sortOrder: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
)

categorySchema.index({ parentId: 1, slug: 1 }, { unique: true })
categorySchema.index({ parentId: 1, status: 1, sortOrder: 1 })

export const Category = mongoose.model('Category', categorySchema)
