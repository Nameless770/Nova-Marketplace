import mongoose from 'mongoose'
import { logger } from '../utils/logger.js'
import { AuditLog } from '../models/AuditLog.js'

export const AUDIT = {
  USER_STATUS_CHANGED: 'user.status_changed',
  SELLER_MODERATED: 'seller.moderated',
  PRODUCT_MODERATED: 'product.moderated',
  REVIEW_MODERATED: 'review.moderated',
  COUPON_STATUS_CHANGED: 'coupon.status_changed',
  REFUND_CREATED: 'refund.created',
}

/**
 * Records a privileged action.
 *
 * Pass the caller's `session` where the mutation runs in a transaction, so the
 * action and its record commit together and neither can exist without the other.
 * Where no transaction exists the write happens immediately afterwards.
 *
 * A logging failure never fails the action — the action already happened, and
 * throwing here would misreport it as not having occurred. It is logged loudly
 * instead, because a silent gap in an audit trail is worse than a noisy one.
 */
export async function recordAudit(entry, session = null) {
  try {
    const document = {
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: mongoose.isValidObjectId(entry.targetId) ? entry.targetId : undefined,
      before: entry.before,
      after: entry.after,
      reason: entry.reason,
      ip: entry.ip,
    }
    if (session) await AuditLog.create([document], { session })
    else await AuditLog.create(document)
  } catch (error) {
    logger.error(
      {
        err: error,
        action: entry?.action,
        actorId: entry?.actorId?.toString?.(),
        targetId: entry?.targetId?.toString?.(),
      },
      'FAILED TO RECORD PRIVILEGED ACTION',
    )
  }
}

export async function listAuditLogs(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100)
  const page = Math.max(Number(query.page) || 1, 1)

  const filter = {}
  if (query.action) filter.action = String(query.action)
  if (query.actorId && mongoose.isValidObjectId(query.actorId)) filter.actorId = query.actorId
  if (query.targetId && mongoose.isValidObjectId(query.targetId)) filter.targetId = query.targetId
  if (query.targetType) filter.targetType = String(query.targetType)

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ])

  return { items, meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } }
}
