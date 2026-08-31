import mongoose from 'mongoose'

/**
 * Append-only record of privileged actions.
 *
 * Nothing in the application updates or deletes these; the schema has no
 * mutation paths and the service exposes only a create and a read. Without this
 * there is no way to answer "who refunded this order, and when" after the fact.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, enum: ['admin', 'seller', 'customer', 'system'], required: true },

    action: { type: String, required: true, trim: true, maxlength: 80 },
    targetType: { type: String, required: true, trim: true, maxlength: 40 },
    targetId: { type: mongoose.Schema.Types.ObjectId },

    // Only the fields that changed, never a whole document — an audit trail
    // holding password hashes or payment details would be its own liability.
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String, trim: true, maxlength: 500 },

    ip: { type: String, trim: true, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

auditLogSchema.index({ createdAt: -1, _id: -1 })
auditLogSchema.index({ actorId: 1, createdAt: -1 })
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })

export const AuditLog = mongoose.model('AuditLog', auditLogSchema)
