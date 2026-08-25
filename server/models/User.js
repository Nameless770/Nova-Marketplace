import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 32 },
    addresses: {
      type: [
        {
          label: { type: String, trim: true, maxlength: 40 },
          firstName: { type: String, required: true, trim: true, maxlength: 80 },
          lastName: { type: String, required: true, trim: true, maxlength: 80 },
          line1: { type: String, required: true, trim: true, maxlength: 120 },
          line2: { type: String, trim: true, maxlength: 120 },
          city: { type: String, required: true, trim: true, maxlength: 80 },
          state: { type: String, required: true, trim: true, maxlength: 80 },
          postalCode: { type: String, required: true, trim: true, maxlength: 20 },
          country: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
            minlength: 2,
            maxlength: 2,
          },
          isDefault: { type: Boolean, default: false },
        },
      ],
      validate: [(addresses) => addresses.length <= 10, 'A user may save at most 10 addresses'],
    },
    role: {
      type: String,
      enum: ['customer', 'seller', 'admin'],
      default: 'customer',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'deleted'],
      default: 'active',
    },
    sellerApprovalStatus: {
      type: String,
      enum: ['not_applicable', 'pending', 'approved', 'rejected', 'suspended'],
      default: 'not_applicable',
    },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    emailVerifiedAt: { type: Date },
  },
  { timestamps: true },
)

userSchema.index({ role: 1, status: 1 })

userSchema.pre('validate', function setDefaultAddress(next) {
  if (this.addresses?.length && !this.addresses.some((address) => address.isDefault)) {
    this.addresses[0].isDefault = true
  }
  next()
})

export const User = mongoose.model('User', userSchema)
